from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from database import get_db
import models
from routes.auth import get_current_user

router = APIRouter(prefix="/api/income", tags=["income"])


class IncomeCreate(BaseModel):
    amount: float
    source: str = "Salary"
    description: str = ""
    date: Optional[str] = None  # ISO format string or None for now


class IncomeUpdate(BaseModel):
    amount: Optional[float] = None
    source: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None


@router.get("")
@router.get("/")
def get_incomes(
    month: Optional[str] = None,  # "YYYY-MM"
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(models.Income).filter(models.Income.user_id == user.id)
    if month:
        try:
            parts = month.split("-")
            year = int(parts[0])
            m = int(parts[1])
            start_date = datetime(year, m, 1)
            if m == 12:
                end_date = datetime(year + 1, 1, 1)
            else:
                end_date = datetime(year, m + 1, 1)
            query = query.filter(models.Income.date >= start_date, models.Income.date < end_date)
        except Exception:
            pass

    incomes = query.order_by(models.Income.date.desc()).all()
    total = sum(i.amount for i in incomes)

    # If no explicit income entries exist for this month, check if user has an active investment plan salary
    plan_salary = 0.0
    plan = db.query(models.InvestmentPlan).filter(
        models.InvestmentPlan.user_id == user.id,
        models.InvestmentPlan.is_active == True
    ).first()
    if plan and plan.monthly_salary > 0:
        plan_salary = plan.monthly_salary

    return {
        "items": [
            {
                "id": inc.id,
                "amount": inc.amount,
                "source": inc.source,
                "description": inc.description,
                "date": inc.date.isoformat(),
                "created_at": inc.created_at.isoformat()
            }
            for inc in incomes
        ],
        "total": total,
        "base_salary": plan_salary,
        "effective_income": total if total > 0 else plan_salary
    }


@router.post("")
@router.post("/")
def create_income(
    data: IncomeCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Income amount must be greater than 0")

    inc_date = datetime.utcnow()
    if data.date:
        try:
            inc_date = datetime.fromisoformat(data.date.replace("Z", "+00:00"))
        except Exception:
            try:
                d = date.fromisoformat(data.date)
                inc_date = datetime.combine(d, datetime.min.time())
            except Exception:
                inc_date = datetime.utcnow()

    inc = models.Income(
        user_id=user.id,
        amount=data.amount,
        source=data.source,
        description=data.description,
        date=inc_date
    )
    db.add(inc)
    db.commit()
    db.refresh(inc)
    return {
        "id": inc.id,
        "amount": inc.amount,
        "source": inc.source,
        "description": inc.description,
        "date": inc.date.isoformat(),
        "created_at": inc.created_at.isoformat()
    }


@router.put("/{income_id}")
def update_income(
    income_id: int,
    data: IncomeUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inc = db.query(models.Income).filter(
        models.Income.id == income_id,
        models.Income.user_id == user.id
    ).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Income entry not found")

    if data.amount is not None:
        if data.amount <= 0:
            raise HTTPException(status_code=400, detail="Income amount must be greater than 0")
        inc.amount = data.amount
    if data.source is not None:
        inc.source = data.source
    if data.description is not None:
        inc.description = data.description
    if data.date is not None:
        try:
            inc.date = datetime.fromisoformat(data.date.replace("Z", "+00:00"))
        except Exception:
            pass

    db.commit()
    db.refresh(inc)
    return {
        "id": inc.id,
        "amount": inc.amount,
        "source": inc.source,
        "description": inc.description,
        "date": inc.date.isoformat()
    }


@router.delete("/{income_id}")
def delete_income(
    income_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inc = db.query(models.Income).filter(
        models.Income.id == income_id,
        models.Income.user_id == user.id
    ).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Income entry not found")

    db.delete(inc)
    db.commit()
    return {"message": "Income entry deleted successfully"}
