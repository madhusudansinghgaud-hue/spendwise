from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from typing import Optional, List
from datetime import datetime, date
from database import get_db
import models
from routes.auth import get_current_user
from routes.savings import calculate_month_financials, get_month_dates

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


def format_inr(val: float) -> str:
    """Format a value as INR string"""
    return f"₹{val:,.0f}"


def format_month_name(month_str: str) -> str:
    try:
        parts = month_str.split("-")
        dt = datetime(int(parts[0]), int(parts[1]), 1)
        return dt.strftime("%B %Y")
    except Exception:
        return month_str


@router.get("/months")
def get_available_months(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns a list of all distinct months (YYYY-MM) with financial activity"""
    months = set()
    today = date.today()
    months.add(f"{today.year}-{today.month:02d}")

    # Prior month
    if today.month == 1:
        months.add(f"{today.year - 1}-12")
    else:
        months.add(f"{today.year}-{today.month - 1:02d}")

    # From expenses
    exp_dates = db.query(models.Expense.date).filter(models.Expense.user_id == user.id).all()
    for (d,) in exp_dates:
        if d:
            months.add(d.strftime("%Y-%m"))

    # From income
    inc_dates = db.query(models.Income.date).filter(models.Income.user_id == user.id).all()
    for (d,) in inc_dates:
        if d:
            months.add(d.strftime("%Y-%m"))

    # From investments
    inv_dates = db.query(models.Investment.date).filter(models.Investment.user_id == user.id).all()
    for (d,) in inv_dates:
        if d:
            months.add(d.strftime("%Y-%m"))

    # From savings records
    sav_months = db.query(models.MonthlySavingsRecord.month_year).filter(models.MonthlySavingsRecord.user_id == user.id).all()
    for (m,) in sav_months:
        if m:
            months.add(m)

    sorted_months = sorted(list(months), reverse=True)
    return [
        {"value": m, "label": format_month_name(m)}
        for m in sorted_months
    ]


@router.get("/monthly-history")
def get_monthly_history(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns all months with summarized financial data for the History page.
    Each entry has income, expenses, investments, remaining, savings_added, is_settled.
    """
    # Collect all months with activity
    months = set()
    today = date.today()
    months.add(f"{today.year}-{today.month:02d}")

    for (d,) in db.query(models.Expense.date).filter(models.Expense.user_id == user.id).all():
        if d: months.add(d.strftime("%Y-%m"))
    for (d,) in db.query(models.Income.date).filter(models.Income.user_id == user.id).all():
        if d: months.add(d.strftime("%Y-%m"))
    for (d,) in db.query(models.Investment.date).filter(models.Investment.user_id == user.id).all():
        if d: months.add(d.strftime("%Y-%m"))
    for (m,) in db.query(models.MonthlySavingsRecord.month_year).filter(models.MonthlySavingsRecord.user_id == user.id).all():
        if m: months.add(m)

    result = []
    for month_str in sorted(list(months), reverse=True):
        fin = calculate_month_financials(db, user.id, month_str)
        settled = db.query(models.MonthlySavingsRecord).filter(
            models.MonthlySavingsRecord.user_id == user.id,
            models.MonthlySavingsRecord.month_year == month_str
        ).first()

        result.append({
            "month_year": month_str,
            "month_label": format_month_name(month_str),
            "income": fin["income"],
            "expenses": fin["expenses"],
            "investments": fin["investments"],
            "remaining": fin["remaining"],
            "positive_leftover": fin["positive_leftover"],
            "savings_added": settled.savings_added if settled else 0.0,
            "is_settled": settled.is_settled if settled else False,
            "settled_at": settled.settled_at.isoformat() if settled and settled.settled_at else None
        })

    return result


@router.get("/monthly")
def get_monthly_analysis(
    month: Optional[str] = None,  # "YYYY-MM"
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    today = date.today()
    target_month = month or f"{today.year}-{today.month:02d}"
    month_label = format_month_name(target_month)
    start_date, end_date = get_month_dates(target_month)

    # 1. Base Financials
    fin = calculate_month_financials(db, user.id, target_month)
    income = fin["income"]
    expenses = fin["expenses"]
    investments = fin["investments"]
    remaining = fin["remaining"]

    # 2. Income breakdown
    incomes = db.query(models.Income).filter(
        models.Income.user_id == user.id,
        models.Income.date >= start_date,
        models.Income.date < end_date
    ).all()

    income_by_source = {}
    for inc in incomes:
        src = inc.source or "Salary"
        income_by_source[src] = income_by_source.get(src, 0.0) + inc.amount

    if not income_by_source and fin["base_salary"] > 0:
        income_by_source["Base Salary"] = fin["base_salary"]

    # 3. Category Expenses Breakdown & Overspending check
    categories = db.query(models.Category).filter(models.Category.user_id == user.id).all()
    cat_breakdown = []
    over_budget_categories = []
    highest_category = None
    max_cat_spent = -1.0

    total_cat_budget = 0.0
    for cat in categories:
        # Check month-specific budget override
        budget_row = db.query(models.CategoryMonthlyBudget).filter(
            models.CategoryMonthlyBudget.user_id == user.id,
            models.CategoryMonthlyBudget.category_id == cat.id,
            models.CategoryMonthlyBudget.month_year == target_month
        ).first()

        budget_amount = budget_row.budget_amount if budget_row else cat.monthly_limit
        total_cat_budget += budget_amount

        spent = db.query(func.sum(models.Expense.amount)).filter(
            models.Expense.user_id == user.id,
            models.Expense.category_id == cat.id,
            models.Expense.date >= start_date,
            models.Expense.date < end_date
        ).scalar() or 0.0

        pct_of_total_expenses = (spent / expenses * 100) if expenses > 0 else 0.0
        remaining_budget = budget_amount - spent
        exceeded = budget_amount > 0 and spent > budget_amount
        excess = max(0.0, spent - budget_amount)

        item = {
            "id": cat.id,
            "name": cat.name,
            "icon": cat.icon,
            "color": cat.color,
            "budget": budget_amount,
            "spent": spent,
            "remaining": remaining_budget,
            "exceeded": exceeded,
            "excess": excess,
            "percentage": round(pct_of_total_expenses, 1)
        }
        cat_breakdown.append(item)

        if exceeded:
            over_budget_categories.append(item)

        if spent > max_cat_spent:
            max_cat_spent = spent
            if spent > 0:
                highest_category = item

    # 4. Investment breakdown
    inv_entries = db.query(models.Investment).filter(
        models.Investment.user_id == user.id,
        models.Investment.date >= start_date,
        models.Investment.date < end_date
    ).all()

    investments_by_type = {}
    for inv in inv_entries:
        cat = inv.category or "Other"
        investments_by_type[cat] = investments_by_type.get(cat, 0.0) + inv.amount

    if not investments_by_type and fin["investment_target"] > 0:
        investments_by_type["Target Plan"] = fin["investment_target"]

    # 5. Savings calculations
    # Check if month was settled
    settled_record = db.query(models.MonthlySavingsRecord).filter(
        models.MonthlySavingsRecord.user_id == user.id,
        models.MonthlySavingsRecord.month_year == target_month
    ).first()

    auto_saved_leftover = settled_record.savings_added if settled_record else max(0.0, remaining)
    is_settled = settled_record.is_settled if settled_record else False

    # Manual savings in this month
    manual_saved = db.query(func.sum(models.SavingsTransaction.amount)).filter(
        models.SavingsTransaction.user_id == user.id,
        models.SavingsTransaction.source != "auto_leftover",
        models.SavingsTransaction.date >= start_date,
        models.SavingsTransaction.date < end_date
    ).scalar() or 0.0

    total_saved_month = auto_saved_leftover + manual_saved
    savings_rate = (total_saved_month / income * 100) if income > 0 else 0.0

    # 6. Formatted Overall Summary Text (Matches prompt's exact requirement)
    highest_cat_name = highest_category["name"] if highest_category else "None"
    summary_text = (
        f"«{month_label} Financial Summary\n\n"
        f"Income: ₹{income:,.0f}\n"
        f"Expenses: ₹{expenses:,.0f}\n"
        f"Investments: ₹{investments:,.0f}\n"
        f"Savings: ₹{total_saved_month:,.0f}\n\n"
        f"Highest Expense Category: {highest_cat_name}\n"
        f"Total Amount Invested: ₹{investments:,.0f}\n"
        f"Total Amount Saved: ₹{total_saved_month:,.0f}»"
    )

    # 7. Comparison with Previous Month
    prev_parts = target_month.split("-")
    pyear = int(prev_parts[0])
    pmonth = int(prev_parts[1])
    if pmonth == 1:
        prev_month_str = f"{pyear - 1}-12"
    else:
        prev_month_str = f"{pyear}-{pmonth - 1:02d}"

    prev_fin = calculate_month_financials(db, user.id, prev_month_str)

    comparison = {
        "prev_month": prev_month_str,
        "income_delta": income - prev_fin["income"],
        "expense_delta": expenses - prev_fin["expenses"],
        "investment_delta": investments - prev_fin["investments"],
        "remaining_delta": remaining - prev_fin["remaining"],
    }

    return {
        "month_year": target_month,
        "month_label": month_label,
        "summary": {
            "income": income,
            "expenses": expenses,
            "investments": investments,
            "savings": total_saved_month,
            "remaining": remaining,
            "positive_leftover": max(0.0, remaining),
            "savings_rate": round(savings_rate, 1),
            "highest_category": highest_category,
            "over_budget_count": len(over_budget_categories),
            "is_settled": is_settled,
            "summary_text": summary_text
        },
        "income_breakdown": [
            {"source": k, "amount": v, "percentage": round(v / income * 100, 1) if income > 0 else 0}
            for k, v in income_by_source.items()
        ],
        "category_breakdown": cat_breakdown,
        "over_budget_categories": over_budget_categories,
        "investments_breakdown": [
            {"type": k, "amount": v, "percentage": round(v / investments * 100, 1) if investments > 0 else 0}
            for k, v in investments_by_type.items()
        ],
        "budget_vs_actual": {
            "total_budget": total_cat_budget,
            "total_spent": expenses,
            "remaining": total_cat_budget - expenses
        },
        "comparison": comparison
    }
