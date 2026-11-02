from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from database import get_db
import models
from routes.auth import get_current_user

router = APIRouter(prefix="/api/investments", tags=["investments"])


class InvestmentPlanCreate(BaseModel):
    name: str = "My Investment Plan"
    monthly_salary: float
    investment_target: float
    investment_type: str = "SIP"
    notes: str = ""


class InvestmentPlanUpdate(BaseModel):
    name: Optional[str] = None
    monthly_salary: Optional[float] = None
    investment_target: Optional[float] = None
    investment_type: Optional[str] = None
    notes: Optional[str] = None


class InvestmentEntryCreate(BaseModel):
    amount: float
    name: str
    category: str = "Mutual Funds SIP"
    date: Optional[str] = None
    notes: str = ""


class InvestmentEntryUpdate(BaseModel):
    amount: Optional[float] = None
    name: Optional[str] = None
    category: Optional[str] = None
    date: Optional[str] = None
    notes: Optional[str] = None


# Plan endpoints (backward compatible)
@router.get("")
@router.get("/")
def get_investment_plans(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    plans = db.query(models.InvestmentPlan).filter(models.InvestmentPlan.user_id == user.id).all()
    return plans


@router.get("/active")
def get_active_plan(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    plan = db.query(models.InvestmentPlan).filter(
        models.InvestmentPlan.user_id == user.id,
        models.InvestmentPlan.is_active == True
    ).first()
    if not plan:
        return None
    return {
        "id": plan.id,
        "name": plan.name,
        "monthly_salary": plan.monthly_salary,
        "investment_target": plan.investment_target,
        "investment_type": plan.investment_type,
        "spending_budget": plan.monthly_salary - plan.investment_target,
        "savings_rate": (plan.investment_target / plan.monthly_salary * 100) if plan.monthly_salary > 0 else 0,
        "notes": plan.notes
    }


@router.post("")
@router.post("/")
def create_investment_plan(
    plan: InvestmentPlanCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if plan.investment_target >= plan.monthly_salary:
        raise HTTPException(status_code=400, detail="Investment target must be less than salary")

    # Deactivate existing plans for this user
    db.query(models.InvestmentPlan).filter(models.InvestmentPlan.user_id == user.id).update({"is_active": False})

    db_plan = models.InvestmentPlan(**plan.model_dump(), user_id=user.id, is_active=True)
    db.add(db_plan)
    db.commit()
    db.refresh(db_plan)
    return db_plan


# Individual investment entry transaction endpoints
@router.get("/entries")
def get_investment_entries(
    month: Optional[str] = None,  # "YYYY-MM"
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(models.Investment).filter(models.Investment.user_id == user.id)
    if month:
        try:
            parts = month.split("-")
            year = int(parts[0])
            m = int(parts[1])
            start_date = datetime(year, m, 1)
            end_date = datetime(year + 1, 1, 1) if m == 12 else datetime(year, m + 1, 1)
            query = query.filter(models.Investment.date >= start_date, models.Investment.date < end_date)
        except Exception:
            pass

    entries = query.order_by(models.Investment.date.desc()).all()
    total = sum(e.amount for e in entries)

    # Check active plan target
    plan = db.query(models.InvestmentPlan).filter(
        models.InvestmentPlan.user_id == user.id,
        models.InvestmentPlan.is_active == True
    ).first()
    plan_target = plan.investment_target if plan else 0.0

    return {
        "items": [
            {
                "id": e.id,
                "amount": e.amount,
                "name": e.name,
                "category": e.category,
                "notes": e.notes,
                "date": e.date.isoformat(),
                "created_at": e.created_at.isoformat()
            }
            for e in entries
        ],
        "total": total,
        "plan_target": plan_target,
        "effective_investment": total if total > 0 else plan_target
    }


@router.post("/entries")
def create_investment_entry(
    data: InvestmentEntryCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Investment amount must be greater than 0")

    inv_date = datetime.utcnow()
    if data.date:
        try:
            inv_date = datetime.fromisoformat(data.date.replace("Z", "+00:00"))
        except Exception:
            try:
                d = date.fromisoformat(data.date)
                inv_date = datetime.combine(d, datetime.min.time())
            except Exception:
                inv_date = datetime.utcnow()

    entry = models.Investment(
        user_id=user.id,
        amount=data.amount,
        name=data.name,
        category=data.category,
        notes=data.notes,
        date=inv_date
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {
        "id": entry.id,
        "amount": entry.amount,
        "name": entry.name,
        "category": entry.category,
        "notes": entry.notes,
        "date": entry.date.isoformat(),
        "created_at": entry.created_at.isoformat()
    }


@router.put("/entries/{entry_id}")
def update_investment_entry(
    entry_id: int,
    data: InvestmentEntryUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    entry = db.query(models.Investment).filter(
        models.Investment.id == entry_id,
        models.Investment.user_id == user.id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Investment entry not found")

    if data.amount is not None:
        if data.amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than 0")
        entry.amount = data.amount
    if data.name is not None:
        entry.name = data.name
    if data.category is not None:
        entry.category = data.category
    if data.notes is not None:
        entry.notes = data.notes
    if data.date is not None:
        try:
            entry.date = datetime.fromisoformat(data.date.replace("Z", "+00:00"))
        except Exception:
            pass

    db.commit()
    db.refresh(entry)
    return {
        "id": entry.id,
        "amount": entry.amount,
        "name": entry.name,
        "category": entry.category,
        "notes": entry.notes,
        "date": entry.date.isoformat()
    }


@router.delete("/entries/{entry_id}")
def delete_investment_entry(
    entry_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    entry = db.query(models.Investment).filter(
        models.Investment.id == entry_id,
        models.Investment.user_id == user.id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Investment entry not found")

    db.delete(entry)
    db.commit()
    return {"message": "Investment entry deleted successfully"}


@router.put("/{plan_id}")
def update_investment_plan(
    plan_id: int,
    plan: InvestmentPlanUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_plan = db.query(models.InvestmentPlan).filter(
        models.InvestmentPlan.id == plan_id,
        models.InvestmentPlan.user_id == user.id
    ).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    for key, value in plan.model_dump(exclude_unset=True).items():
        setattr(db_plan, key, value)
    db.commit()
    db.refresh(db_plan)
    return db_plan


@router.delete("/{plan_id}")
def delete_plan(
    plan_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_plan = db.query(models.InvestmentPlan).filter(
        models.InvestmentPlan.id == plan_id,
        models.InvestmentPlan.user_id == user.id
    ).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    db.delete(db_plan)
    db.commit()
    return {"message": "Plan deleted"}
