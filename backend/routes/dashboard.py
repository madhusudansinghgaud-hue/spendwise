from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date, timedelta
from database import get_db
import models
from routes.auth import get_current_user
from routes.savings import calculate_month_financials

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
def get_dashboard_summary(
    month: Optional[str] = None,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    today = date.today()
    if month:
        try:
            parts = month.split("-")
            month_str = f"{int(parts[0])}-{int(parts[1]):02d}"
            month_start = datetime(int(parts[0]), int(parts[1]), 1)
        except Exception:
            month_str = f"{today.year}-{today.month:02d}"
            month_start = datetime(today.year, today.month, 1)
    else:
        month_str = f"{today.year}-{today.month:02d}"
        month_start = datetime(today.year, today.month, 1)

    # 1. Monthly Financial Core Equation (Total Income - Total Expenses - Total Investments = Remaining)
    fin = calculate_month_financials(db, user.id, month_str)

    # 2. Cumulative Lifetime Savings
    total_savings = db.query(func.sum(models.SavingsTransaction.amount)).filter(
        models.SavingsTransaction.user_id == user.id
    ).scalar() or 0.0

    # 3. Today's total spending
    today_total = db.query(func.sum(models.Expense.amount)).filter(
        models.Expense.user_id == user.id,
        func.date(models.Expense.date) == today
    ).scalar() or 0.0

    # 4. Category-wise breakdown & quota tracking
    categories = db.query(models.Category).filter(models.Category.user_id == user.id).all()
    exceeded_today = []
    category_summary = []

    for cat in categories:
        # Check month-specific budget override
        budget_row = db.query(models.CategoryMonthlyBudget).filter(
            models.CategoryMonthlyBudget.user_id == user.id,
            models.CategoryMonthlyBudget.category_id == cat.id,
            models.CategoryMonthlyBudget.month_year == month_str
        ).first()

        effective_budget = budget_row.budget_amount if budget_row else cat.monthly_limit

        daily_spent = db.query(func.sum(models.Expense.amount)).filter(
            models.Expense.user_id == user.id,
            models.Expense.category_id == cat.id,
            func.date(models.Expense.date) == today
        ).scalar() or 0.0

        monthly_spent = db.query(func.sum(models.Expense.amount)).filter(
            models.Expense.user_id == user.id,
            models.Expense.category_id == cat.id,
            models.Expense.date >= month_start
        ).scalar() or 0.0

        if cat.daily_limit > 0 and daily_spent > cat.daily_limit:
            exceeded_today.append({
                "category": cat.name,
                "icon": cat.icon,
                "color": cat.color,
                "spent": daily_spent,
                "limit": cat.daily_limit,
                "excess": daily_spent - cat.daily_limit
            })

        category_summary.append({
            "id": cat.id,
            "name": cat.name,
            "icon": cat.icon,
            "color": cat.color,
            "daily_spent": daily_spent,
            "daily_limit": cat.daily_limit,
            "monthly_spent": monthly_spent,
            "monthly_limit": effective_budget,
            "remaining": effective_budget - monthly_spent,
            "exceeded": effective_budget > 0 and monthly_spent > effective_budget,
            "excess": max(0.0, monthly_spent - effective_budget)
        })

    # 5. Last 7 days spending trend
    trend = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        daily_sum = db.query(func.sum(models.Expense.amount)).filter(
            models.Expense.user_id == user.id,
            func.date(models.Expense.date) == day
        ).scalar() or 0.0
        trend.append({"date": day.strftime("%d %b"), "amount": daily_sum})

    # 6. Buffer fund status
    fund = db.query(models.BufferFund).filter(models.BufferFund.user_id == user.id).first()
    daily_buf_limit = fund.daily_buffer if fund else 150.0
    monthly_buf_limit = fund.monthly_buffer if fund else 3000.0

    buffer_used_today = db.query(func.sum(models.BufferUsage.amount)).filter(
        models.BufferUsage.user_id == user.id,
        func.date(models.BufferUsage.date) == today
    ).scalar() or 0.0

    buffer_used_month = db.query(func.sum(models.BufferUsage.amount)).filter(
        models.BufferUsage.user_id == user.id,
        models.BufferUsage.date >= month_start
    ).scalar() or 0.0

    daily_buffer_remaining = max(0.0, daily_buf_limit - buffer_used_today)
    monthly_buffer_remaining = max(0.0, monthly_buf_limit - buffer_used_month)

    # 7. Recent transactions snippet (Expenses + Incomes + Investments combined)
    recent_expenses = db.query(models.Expense).filter(
        models.Expense.user_id == user.id
    ).order_by(models.Expense.date.desc()).limit(5).all()

    recent_txs = []
    for e in recent_expenses:
        recent_txs.append({
            "id": f"exp-{e.id}",
            "type": "expense",
            "title": e.description or e.merchant or (e.category.name if e.category else "Expense"),
            "category": e.category.name if e.category else "General",
            "icon": e.category.icon if e.category else "💸",
            "amount": e.amount,
            "date": e.date.isoformat(),
            "badge": "Expense"
        })

    recent_txs.sort(key=lambda x: x["date"], reverse=True)

    # 8. Rebalancing suggestions
    suggestions = generate_suggestions(exceeded_today, category_summary, fin["remaining"], daily_buffer_remaining)

    # Get active plan details
    plan = db.query(models.InvestmentPlan).filter(
        models.InvestmentPlan.user_id == user.id,
        models.InvestmentPlan.is_active == True
    ).first()

    total_budgeted = sum(c["monthly_limit"] for c in category_summary)
    unallocated_reserve = max(0.0, fin["income"] - total_budgeted)
    budget_shortfall = max(0.0, total_budgeted - fin["income"])

    return {
        # Core 4 pillars + remaining
        "monthly_income": fin["income"],
        "monthly_expenses": fin["expenses"],
        "monthly_investments": fin["investments"],
        "actual_investments": fin["investments"],
        "savings_transfers": fin.get("savings_transfers", 0.0),
        "investment_target": fin["investment_target"],
        "remaining_amount": fin["remaining"],
        "positive_leftover": fin["positive_leftover"],
        "total_savings": total_savings,
        "today_total": today_total,
        
        # Budget Planning Overview
        "total_budgeted": total_budgeted,
        "unallocated_reserve": unallocated_reserve,
        "budget_shortfall": budget_shortfall,
        "is_budget_exceeded": budget_shortfall > 0,
        
        # Legacy/Compatibility keys
        "month_total": fin["expenses"],
        "salary": fin["income"],
        "spending_budget": max(0.0, fin["income"] - fin["investment_target"]),
        "remaining_budget": fin["remaining"],


        "category_summary": category_summary,
        "exceeded_today": exceeded_today,
        "recent_transactions": recent_txs,
        "trend": trend,
        "suggestions": suggestions,
        "buffer": {
            "daily_limit": daily_buf_limit,
            "daily_used": buffer_used_today,
            "daily_remaining": daily_buffer_remaining,
            "monthly_limit": monthly_buf_limit,
            "monthly_used": buffer_used_month,
            "monthly_remaining": monthly_buffer_remaining,
        },
        "investment_plan": {
            "name": plan.name if plan else None,
            "type": plan.investment_type if plan else None,
        } if plan else None
    }


def generate_suggestions(exceeded: list, categories: list, remaining_budget: float, daily_buffer_remaining: float = 0.0) -> list:
    suggestions = []
    for exc in exceeded:
        excess = exc["excess"]
        cat_name = exc["category"]

        recoverable = []
        for cat in categories:
            if cat["name"] != cat_name and cat.get("daily_limit", 0) > 0:
                daily_remaining = cat["daily_limit"] - cat["daily_spent"]
                if daily_remaining > 0:
                    recoverable.append({
                        "id": cat["id"],
                        "name": cat["name"],
                        "icon": cat["icon"],
                        "available": daily_remaining,
                        "suggested_cut": min(excess, daily_remaining)
                    })

        buffer_note = ""
        if daily_buffer_remaining >= excess:
            buffer_note = f"🛡️ You have ₹{daily_buffer_remaining:.0f} in today's Buffer Space to absorb this fully!"
        elif daily_buffer_remaining > 0:
            buffer_note = f"🛡️ You can absorb ₹{daily_buffer_remaining:.0f} from Buffer Space and balance the rest."

        if recoverable:
            suggestions.append({
                "type": "rebalance",
                "category": cat_name,
                "excess": excess,
                "message": f"Overspent ₹{excess:.0f} on {cat_name}. {buffer_note}".strip(),
                "buffer_available": daily_buffer_remaining,
                "recoverable": recoverable[:3]
            })
        else:
            suggestions.append({
                "type": "warning",
                "category": cat_name,
                "excess": excess,
                "message": f"Overspent ₹{excess:.0f} on {cat_name}. {buffer_note or 'Consider saving tomorrow.'}".strip(),
                "buffer_available": daily_buffer_remaining,
                "recoverable": []
            })

    if remaining_budget < 0:
        suggestions.append({
            "type": "critical",
            "message": f"⚠️ Monthly deficit of ₹{abs(remaining_budget):,.0f}! Your expenses and investments exceed your income.",
            "recoverable": []
        })
    elif remaining_budget < 5000:
        suggestions.append({
            "type": "caution",
            "message": f"Only ₹{remaining_budget:,.0f} unallocated remaining this month. Spend carefully!",
            "recoverable": []
        })

    return suggestions
