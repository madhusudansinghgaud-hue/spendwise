from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from database import get_db
import models

router = APIRouter(prefix="/api/buffer", tags=["buffer"])


class BufferSettingsUpdate(BaseModel):
    daily_buffer: float
    monthly_buffer: float


class BufferAbsorbRequest(BaseModel):
    amount: float
    category_id: Optional[int] = None
    reason: str = "Quota excess absorption"


from routes.auth import get_current_user


def get_or_create_buffer_fund(db: Session, user_id: int) -> models.BufferFund:
    fund = db.query(models.BufferFund).filter(models.BufferFund.user_id == user_id).first()
    if not fund:
        fund = models.BufferFund(daily_buffer=150.0, monthly_buffer=3000.0, user_id=user_id)
        db.add(fund)
        db.commit()
        db.refresh(fund)
    return fund


@router.get("/status")
def get_buffer_status(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    fund = get_or_create_buffer_fund(db, user.id)
    today = date.today()
    month_start = today.replace(day=1)

    daily_used = db.query(func.sum(models.BufferUsage.amount)).filter(
        models.BufferUsage.user_id == user.id,
        func.date(models.BufferUsage.date) == today
    ).scalar() or 0.0

    monthly_used = db.query(func.sum(models.BufferUsage.amount)).filter(
        models.BufferUsage.user_id == user.id,
        models.BufferUsage.date >= datetime.combine(month_start, datetime.min.time())
    ).scalar() or 0.0

    daily_remaining = max(0.0, fund.daily_buffer - daily_used)
    monthly_remaining = max(0.0, fund.monthly_buffer - monthly_used)

    recent_usages = db.query(models.BufferUsage).filter(
        models.BufferUsage.user_id == user.id
    ).order_by(
        models.BufferUsage.date.desc()
    ).limit(10).all()

    usages_data = []
    for u in recent_usages:
        usages_data.append({
            "id": u.id,
            "amount": u.amount,
            "reason": u.reason,
            "category_id": u.category_id,
            "category_name": u.category.name if u.category else "General",
            "category_icon": u.category.icon if u.category else "🛡️",
            "date": u.date.isoformat()
        })

    return {
        "daily_buffer": fund.daily_buffer,
        "daily_used": daily_used,
        "daily_remaining": daily_remaining,
        "daily_percent": (daily_used / fund.daily_buffer * 100) if fund.daily_buffer > 0 else 0,
        "monthly_buffer": fund.monthly_buffer,
        "monthly_used": monthly_used,
        "monthly_remaining": monthly_remaining,
        "monthly_percent": (monthly_used / fund.monthly_buffer * 100) if fund.monthly_buffer > 0 else 0,
        "recent_usages": usages_data
    }


@router.post("/absorb")
def absorb_excess(
    payload: BufferAbsorbRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Absorption amount must be greater than 0")

    fund = get_or_create_buffer_fund(db, user.id)
    today = date.today()
    daily_used = db.query(func.sum(models.BufferUsage.amount)).filter(
        models.BufferUsage.user_id == user.id,
        func.date(models.BufferUsage.date) == today
    ).scalar() or 0.0

    available = fund.daily_buffer - daily_used

    usage = models.BufferUsage(
        amount=payload.amount,
        category_id=payload.category_id,
        reason=payload.reason,
        user_id=user.id
    )
    db.add(usage)
    db.commit()
    db.refresh(usage)

    return {
        "message": f"Successfully absorbed Rs.{payload.amount:.0f} into Buffer Space!",
        "absorbed_amount": payload.amount,
        "available_previously": available,
        "new_daily_used": daily_used + payload.amount,
        "buffer_usage_id": usage.id
    }


@router.put("/settings")
def update_buffer_settings(
    settings: BufferSettingsUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    fund = get_or_create_buffer_fund(db, user.id)
    fund.daily_buffer = settings.daily_buffer
    fund.monthly_buffer = settings.monthly_buffer
    db.commit()
    db.refresh(fund)
    return {
        "message": "Buffer settings updated successfully",
        "daily_buffer": fund.daily_buffer,
        "monthly_buffer": fund.monthly_buffer
    }
