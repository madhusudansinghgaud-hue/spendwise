from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from database import get_db
import models
from routes.auth import get_current_user

router = APIRouter(prefix="/api/savings", tags=["savings"])


class SettleMonthRequest(BaseModel):
    month_year: Optional[str] = None  # "YYYY-MM", defaults to current month
    notes: Optional[str] = ""


class ManualSavingsDeposit(BaseModel):
    amount: float
    title: str = "Manual Savings Deposit"
    source: str = "manual_deposit"  # manual_deposit, emergency_buffer, goal_allocation
    notes: Optional[str] = ""


def get_month_dates(month_str: str):
    parts = month_str.split("-")
    year = int(parts[0])
    m = int(parts[1])
    start_date = datetime(year, m, 1)
    end_date = datetime(year + 1, 1, 1) if m == 12 else datetime(year, m + 1, 1)
    return start_date, end_date


def calculate_month_financials(db: Session, user_id: int, month_str: str):
    start_date, end_date = get_month_dates(month_str)

    # User profile for base salary
    user = db.query(models.User).filter(models.User.id == user_id).first()
    plan = db.query(models.InvestmentPlan).filter(
        models.InvestmentPlan.user_id == user_id,
        models.InvestmentPlan.is_active == True
    ).first()

    base_salary = user.monthly_income if (user and user.monthly_income and user.monthly_income > 0) else (plan.monthly_salary if plan else 50000.0)

    # 1. Actual Income
    incomes_sum = db.query(func.sum(models.Income.amount)).filter(
        models.Income.user_id == user_id,
        models.Income.date >= start_date,
        models.Income.date < end_date
    ).scalar() or 0.0

    effective_income = incomes_sum if incomes_sum > 0 else base_salary

    # 2. Actual Expenses
    expenses_sum = db.query(func.sum(models.Expense.amount)).filter(
        models.Expense.user_id == user_id,
        models.Expense.date >= start_date,
        models.Expense.date < end_date
    ).scalar() or 0.0

    # 3. Actual Investments (actual transactions only - planned target is separate)
    investments_sum = db.query(func.sum(models.Investment.amount)).filter(
        models.Investment.user_id == user_id,
        models.Investment.date >= start_date,
        models.Investment.date < end_date
    ).scalar() or 0.0

    # 4. Actual Savings transfers recorded for this month
    savings_sum = db.query(func.sum(models.SavingsTransaction.amount)).filter(
        models.SavingsTransaction.user_id == user_id,
        models.SavingsTransaction.date >= start_date,
        models.SavingsTransaction.date < end_date,
        models.SavingsTransaction.source != "auto_leftover"  # Do not deduct previous settled leftover
    ).scalar() or 0.0

    plan_target = plan.investment_target if plan else 0.0

    # Core Cash Flow Equation:
    # Remaining Cash = Actual Income - Actual Expenses - Actual Investments - Actual Savings
    remaining = effective_income - expenses_sum - investments_sum - savings_sum

    return {
        "month_year": month_str,
        "income": effective_income,
        "explicit_income": incomes_sum,
        "base_salary": base_salary,
        "expenses": expenses_sum,
        "investments": investments_sum,
        "explicit_investments": investments_sum,
        "savings_transfers": savings_sum,
        "investment_target": plan_target,
        "remaining": remaining,
        "positive_leftover": max(0.0, remaining)
    }



@router.get("/summary")
def get_savings_summary(
    month: Optional[str] = None,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    today = date.today()
    target_month = month or f"{today.year}-{today.month:02d}"

    # Total accumulated lifetime savings for user
    total_savings = db.query(func.sum(models.SavingsTransaction.amount)).filter(
        models.SavingsTransaction.user_id == user.id
    ).scalar() or 0.0

    # Auto-saved leftover total
    auto_saved_total = db.query(func.sum(models.SavingsTransaction.amount)).filter(
        models.SavingsTransaction.user_id == user.id,
        models.SavingsTransaction.source == "auto_leftover"
    ).scalar() or 0.0

    # Current month financial calculation
    fin = calculate_month_financials(db, user.id, target_month)

    # Check if this month has already been settled into savings
    settled_record = db.query(models.MonthlySavingsRecord).filter(
        models.MonthlySavingsRecord.user_id == user.id,
        models.MonthlySavingsRecord.month_year == target_month
    ).first()

    return {
        "total_savings": total_savings,
        "auto_saved_total": auto_saved_total,
        "manual_savings_total": total_savings - auto_saved_total,
        "month_financials": fin,
        "is_settled": settled_record.is_settled if settled_record else False,
        "settled_record": {
            "id": settled_record.id,
            "month_year": settled_record.month_year,
            "savings_added": settled_record.savings_added,
            "settled_at": settled_record.settled_at.isoformat()
        } if settled_record else None
    }


@router.get("/history")
def get_savings_history(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns historical monthly savings closures and all individual transactions"""
    monthly_records = db.query(models.MonthlySavingsRecord).filter(
        models.MonthlySavingsRecord.user_id == user.id
    ).order_by(models.MonthlySavingsRecord.month_year.desc()).all()

    transactions = db.query(models.SavingsTransaction).filter(
        models.SavingsTransaction.user_id == user.id
    ).order_by(models.SavingsTransaction.date.desc()).limit(50).all()

    total_savings = db.query(func.sum(models.SavingsTransaction.amount)).filter(
        models.SavingsTransaction.user_id == user.id
    ).scalar() or 0.0

    return {
        "total_savings": total_savings,
        "monthly_records": [
            {
                "id": r.id,
                "month_year": r.month_year,
                "income": r.income,
                "expenses": r.expenses,
                "investments": r.investments,
                "remaining_amount": r.remaining_amount,
                "savings_added": r.savings_added,
                "is_settled": r.is_settled,
                "settled_at": r.settled_at.isoformat() if r.settled_at else None,
                "notes": r.notes
            }
            for r in monthly_records
        ],
        "transactions": [
            {
                "id": t.id,
                "amount": t.amount,
                "source": t.source,
                "month_year": t.month_year,
                "title": t.title,
                "date": t.date.isoformat(),
                "created_at": t.created_at.isoformat()
            }
            for t in transactions
        ]
    }


@router.post("/settle-month")
def settle_monthly_leftover(
    req: SettleMonthRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Settles remaining money at month-end into Savings.
    CRITICAL RULE: Never double-counts the same month's remaining amount.
    """
    today = date.today()
    target_month = req.month_year or f"{today.year}-{today.month:02d}"

    # Check for existing settlement record to PREVENT DOUBLE COUNTING
    existing = db.query(models.MonthlySavingsRecord).filter(
        models.MonthlySavingsRecord.user_id == user.id,
        models.MonthlySavingsRecord.month_year == target_month
    ).first()

    if existing and existing.is_settled:
        return {
            "status": "already_settled",
            "message": f"{target_month} leftover was already added to savings (₹{existing.savings_added:,.0f}). Double-counting prevented.",
            "record": {
                "month_year": existing.month_year,
                "savings_added": existing.savings_added,
                "settled_at": existing.settled_at.isoformat()
            }
        }

    # Perform calculation: Income - Expenses - Investments = Remaining
    fin = calculate_month_financials(db, user.id, target_month)
    leftover = fin["positive_leftover"]

    # Record the settlement
    if not existing:
        record = models.MonthlySavingsRecord(
            user_id=user.id,
            month_year=target_month,
            income=fin["income"],
            expenses=fin["expenses"],
            investments=fin["investments"],
            remaining_amount=fin["remaining"],
            savings_added=leftover,
            is_settled=True,
            settled_at=datetime.utcnow(),
            notes=req.notes or f"Auto-settled leftover: ₹{leftover:,.0f}"
        )
        db.add(record)
    else:
        existing.income = fin["income"]
        existing.expenses = fin["expenses"]
        existing.investments = fin["investments"]
        existing.remaining_amount = fin["remaining"]
        existing.savings_added = leftover
        existing.is_settled = True
        existing.settled_at = datetime.utcnow()
        record = existing

    # Add transaction to user's Savings vault if positive leftover
    if leftover > 0:
        tx = models.SavingsTransaction(
            user_id=user.id,
            amount=leftover,
            source="auto_leftover",
            month_year=target_month,
            title=f"Monthly Leftover ({target_month})",
            date=datetime.utcnow()
        )
        db.add(tx)

    db.commit()

    total_savings = db.query(func.sum(models.SavingsTransaction.amount)).filter(
        models.SavingsTransaction.user_id == user.id
    ).scalar() or 0.0

    return {
        "status": "success",
        "message": f"Successfully settled {target_month}: Added ₹{leftover:,.0f} to Savings!" if leftover > 0 else f"{target_month} settled. No positive leftover remaining to add to savings.",
        "savings_added": leftover,
        "total_savings": total_savings,
        "financials": fin
    }


@router.post("/deposit")
def add_manual_deposit(
    data: ManualSavingsDeposit,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Deposit amount must be greater than 0")

    tx = models.SavingsTransaction(
        user_id=user.id,
        amount=data.amount,
        source=data.source,
        title=data.title,
        date=datetime.utcnow()
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)

    total_savings = db.query(func.sum(models.SavingsTransaction.amount)).filter(
        models.SavingsTransaction.user_id == user.id
    ).scalar() or 0.0

    return {
        "status": "success",
        "message": f"Deposited ₹{data.amount:,.0f} to Savings!",
        "transaction_id": tx.id,
        "total_savings": total_savings
    }



@router.delete("/reset-test-data")
def reset_savings_test_data(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Test-only endpoint: deletes all savings records and transactions for the
    current user so that settle-month tests start from a clean state.
    """
    db.query(models.MonthlySavingsRecord).filter(
        models.MonthlySavingsRecord.user_id == user.id
    ).delete()
    db.query(models.SavingsTransaction).filter(
        models.SavingsTransaction.user_id == user.id
    ).delete()
    db.commit()
    return {"status": "ok", "message": "Savings test data cleared."}
