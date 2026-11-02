from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from database import get_db
import models


router = APIRouter(prefix="/api/auth", tags=["auth"])


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar: Optional[str] = None
    role_title: Optional[str] = None
    theme: Optional[str] = None
    monthly_income: Optional[float] = None
    allocation_mode: Optional[str] = None



class LoginRequest(BaseModel):
    username: str
    password: Optional[str] = ""


class RegisterRequest(BaseModel):
    username: str
    display_name: str
    avatar: str = "👨‍💻"
    role_title: str = "Smart Budgeter"
    password: Optional[str] = ""


from fastapi import Header, Query

def ensure_user_seeded(user: models.User, db: Session):
    cat_count = db.query(models.Category).filter(models.Category.user_id == user.id).count()
    if cat_count == 0:
        defaults = [
            {"name": "Groceries", "icon": "🛒", "color": "#10b981", "daily_limit": 500.0, "monthly_limit": 8000.0},
            {"name": "Cigarettes", "icon": "🚬", "color": "#f59e0b", "daily_limit": 150.0, "monthly_limit": 3000.0},
            {"name": "Beverages", "icon": "☕", "color": "#8b5cf6", "daily_limit": 200.0, "monthly_limit": 4000.0},
            {"name": "Transport", "icon": "🚗", "color": "#3b82f6", "daily_limit": 300.0, "monthly_limit": 5000.0},
            {"name": "Food", "icon": "🍔", "color": "#ef4444", "daily_limit": 400.0, "monthly_limit": 7000.0},
            {"name": "Entertainment", "icon": "🎮", "color": "#ec4899", "daily_limit": 300.0, "monthly_limit": 3000.0},
        ]
        for d in defaults:
            db.add(models.Category(**d, user_id=user.id))
        db.commit()

    buf = db.query(models.BufferFund).filter(models.BufferFund.user_id == user.id).first()
    if not buf:
        db.add(models.BufferFund(daily_buffer=150.0, monthly_buffer=3000.0, user_id=user.id))
        db.commit()

    inv = db.query(models.InvestmentPlan).filter(models.InvestmentPlan.user_id == user.id).first()
    if not inv:
        db.add(models.InvestmentPlan(
            name="Monthly Wealth Builder",
            monthly_salary=50000.0,
            investment_target=10000.0,
            investment_type="Mutual Funds SIP",
            notes="Target ₹10,000/month wealth accumulation",
            is_active=True,
            user_id=user.id
        ))
        db.commit()


def get_or_create_default_user(db: Session) -> models.User:
    user = db.query(models.User).first()
    if not user:
        user = models.User(
            username="hunter",
            display_name="Hunter",
            avatar="👨‍💻",
            role_title="Smart Budgeter",
            theme="dark"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    ensure_user_seeded(user, db)
    return user


def get_current_user(
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    x_username: Optional[str] = Header(None, alias="X-Username"),
    username: Optional[str] = Query(None),
    db: Session = Depends(get_db)
) -> models.User:
    user = None
    if x_user_id:
        user = db.query(models.User).filter(models.User.id == x_user_id).first()
    if not user and x_username:
        user = db.query(models.User).filter(models.User.username == x_username.lower().strip()).first()
    if not user and username:
        user = db.query(models.User).filter(models.User.username == username.lower().strip()).first()
    if not user:
        user = get_or_create_default_user(db)

    ensure_user_seeded(user, db)
    return user


@router.get("/profile")
def get_profile(user: models.User = Depends(get_current_user)):
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "avatar": user.avatar,
        "role_title": user.role_title,
        "theme": user.theme or "dark",
        "monthly_income": user.monthly_income or 50000.0,
        "allocation_mode": user.allocation_mode or "auto"
    }


@router.put("/profile")
def update_profile(payload: ProfileUpdate, username: Optional[str] = None, db: Session = Depends(get_db)):
    if username:
        user = db.query(models.User).filter(models.User.username == username.lower()).first()
    else:
        user = get_or_create_default_user(db)

    if not user:
        user = get_or_create_default_user(db)

    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(user, field, value)

    # Sync monthly_salary with active InvestmentPlan if updated
    if payload.monthly_income is not None:
        plan = db.query(models.InvestmentPlan).filter(
            models.InvestmentPlan.user_id == user.id,
            models.InvestmentPlan.is_active == True
        ).first()
        if plan:
            plan.monthly_salary = payload.monthly_income

    db.commit()
    db.refresh(user)

    return {
        "message": "Profile updated successfully!",
        "user": {
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "avatar": user.avatar,
            "role_title": user.role_title,
            "theme": user.theme,
            "monthly_income": user.monthly_income,
            "allocation_mode": user.allocation_mode
        }
    }



@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    username = payload.username.strip().lower()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")

    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        user = models.User(
            username=username,
            display_name=payload.username.strip().capitalize(),
            avatar="🚀",
            role_title="Smart Budgeter",
            theme="dark"
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return {
        "message": f"Welcome, {user.display_name}!",
        "user": {
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "avatar": user.avatar,
            "role_title": user.role_title,
            "theme": user.theme or "dark"
        }
    }


@router.post("/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    username = payload.username.strip().lower()
    existing = db.query(models.User).filter(models.User.username == username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    new_user = models.User(
        username=username,
        display_name=payload.display_name or username.capitalize(),
        avatar=payload.avatar or "👨‍💻",
        role_title=payload.role_title or "Smart Budgeter",
        theme="dark"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "message": "User registered successfully!",
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "display_name": new_user.display_name,
            "avatar": new_user.avatar,
            "role_title": new_user.role_title,
            "theme": new_user.theme
        }
    }


import budget_engine


class CategoryInput(BaseModel):
    name: str
    icon: str = "💰"
    color: str = "#6366f1"
    daily_limit: float = 0.0
    monthly_limit: float = 0.0
    is_essential: bool = True
    priority: int = 1
    allocation_mode: str = "auto"


class OnboardingRequest(BaseModel):
    username: str
    display_name: str
    avatar: str = "👨‍💻"
    role_title: str = "Smart Budgeter"
    theme: str = "dark"
    monthly_income: float = 10000.0
    other_income: float = 0.0
    existing_obligations: float = 0.0
    savings_target: Optional[float] = None
    investment_type: str = "Mutual Funds SIP"
    daily_buffer: Optional[float] = None
    monthly_buffer: Optional[float] = None
    categories: list[CategoryInput] = []
    allocation_mode: str = "auto"


class IncomeUpdateRequest(BaseModel):
    monthly_income: float
    recalculate: bool = True


@router.post("/onboard")
def onboard(payload: OnboardingRequest, db: Session = Depends(get_db)):
    username = payload.username.strip().lower()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")

    existing = db.query(models.User).filter(models.User.username == username).first()
    if existing:
        user = existing
        user.display_name = payload.display_name or username.capitalize()
        user.avatar = payload.avatar
        user.role_title = payload.role_title
        user.theme = payload.theme
        user.monthly_income = payload.monthly_income
        user.allocation_mode = payload.allocation_mode
    else:
        user = models.User(
            username=username,
            display_name=payload.display_name or username.capitalize(),
            avatar=payload.avatar or "👨‍💻",
            role_title=payload.role_title or "Smart Budgeter",
            theme=payload.theme or "dark",
            monthly_income=payload.monthly_income,
            allocation_mode=payload.allocation_mode
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # 1. Clean previous categories and budgets for this user if re-onboarding
    db.query(models.Category).filter(models.Category.user_id == user.id).delete()
    db.query(models.CategoryMonthlyBudget).filter(models.CategoryMonthlyBudget.user_id == user.id).delete()
    db.query(models.InvestmentPlan).filter(models.InvestmentPlan.user_id == user.id).delete()
    db.query(models.BufferFund).filter(models.BufferFund.user_id == user.id).delete()
    db.commit()

    # 2. Prepare categories
    cats_to_create = payload.categories
    if not cats_to_create:
        cats_to_create = [
            CategoryInput(name="Groceries", icon="🛒", color="#10b981", is_essential=True, priority=1),
            CategoryInput(name="Fuel & Transportation", icon="🚗", color="#3b82f6", is_essential=True, priority=1),
            CategoryInput(name="Utilities & Mobile", icon="💡", color="#8b5cf6", is_essential=True, priority=2),
            CategoryInput(name="Personal Expenses", icon="🛍️", color="#f59e0b", is_essential=False, priority=6),
            CategoryInput(name="Food & Dining", icon="🍔", color="#ef4444", is_essential=False, priority=6),
        ]

    cat_dicts = [c.model_dump() for c in cats_to_create]

    # 3. Calculate budget distribution ensuring Total planned <= Available income
    alloc_res = budget_engine.calculate_budget_allocation(
        monthly_income=payload.monthly_income,
        other_income=payload.other_income,
        existing_obligations=payload.existing_obligations,
        categories=cat_dicts
    )

    today = date.today()
    current_month_str = f"{today.year}-{today.month:02d}"

    alloc_map = {a["name"]: a for a in alloc_res["allocations"]}
    for c in cats_to_create:
        matched = alloc_map.get(c.name)
        m_alloc = matched["monthly_allocation"] if matched else round(c.monthly_limit or 0, 0)
        d_limit = matched["daily_limit"] if matched else round(m_alloc / 30.0, 1)

        db_cat = models.Category(
            name=c.name,
            icon=c.icon,
            color=c.color,
            daily_limit=d_limit,
            monthly_limit=m_alloc,
            is_essential=c.is_essential,
            priority=c.priority,
            allocation_mode=c.allocation_mode or "auto",
            user_id=user.id
        )
        db.add(db_cat)
        db.flush()

        # Create CategoryMonthlyBudget entry for current month
        db.add(models.CategoryMonthlyBudget(
            user_id=user.id,
            category_id=db_cat.id,
            month_year=current_month_str,
            budget_amount=m_alloc,
            allocation_mode="auto"
        ))

    # 4. Create Investment Plan
    inv_target = alloc_res["investment_target"] if alloc_res.get("investment_target") is not None else (payload.savings_target or 1000.0)
    db.add(models.InvestmentPlan(
        name="Personal Wealth Target",
        monthly_salary=payload.monthly_income,
        investment_target=inv_target,
        investment_type=payload.investment_type or "Mutual Funds SIP",
        notes="Configured automatically via income budget engine",
        is_active=True,
        user_id=user.id
    ))

    # 5. Create Buffer Fund
    buf_target = alloc_res["buffer_fund"] if alloc_res.get("buffer_fund") is not None else (payload.monthly_buffer or 1000.0)
    db.add(models.BufferFund(
        daily_buffer=round(buf_target / 30.0, 1),
        monthly_buffer=buf_target,
        user_id=user.id
    ))

    db.commit()
    db.refresh(user)

    return {
        "message": f"Welcome aboard, {user.display_name}! Your intelligent budget is ready 🚀",
        "user": {
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "avatar": user.avatar,
            "role_title": user.role_title,
            "theme": user.theme or "dark",
            "monthly_income": user.monthly_income,
            "allocation_mode": user.allocation_mode
        },
        "budget_summary": alloc_res
    }


@router.put("/income")
def update_user_income(
    payload: IncomeUpdateRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update monthly income and optionally recalculate all category budgets, buffer, and investments.
    """
    if payload.monthly_income <= 0:
        raise HTTPException(status_code=400, detail="Monthly income must be greater than 0")

    old_income = user.monthly_income or 50000.0
    user.monthly_income = payload.monthly_income

    plan = db.query(models.InvestmentPlan).filter(
        models.InvestmentPlan.user_id == user.id,
        models.InvestmentPlan.is_active == True
    ).first()
    if plan:
        plan.monthly_salary = payload.monthly_income

    today = date.today()
    month_str = f"{today.year}-{today.month:02d}"

    categories = db.query(models.Category).filter(models.Category.user_id == user.id).all()
    cat_dicts = [
        {
            "id": c.id,
            "name": c.name,
            "icon": c.icon,
            "color": c.color,
            "is_essential": c.is_essential if hasattr(c, 'is_essential') and c.is_essential is not None else True,
            "priority": c.priority if hasattr(c, 'priority') and c.priority is not None else 1,
            "monthly_limit": c.monthly_limit,
            "allocation_mode": c.allocation_mode or "auto"
        }
        for c in categories
    ]

    alloc_res = budget_engine.calculate_budget_allocation(
        monthly_income=payload.monthly_income,
        categories=cat_dicts
    )

    if payload.recalculate or (user.allocation_mode == "auto"):
        for alloc in alloc_res["allocations"]:
            cid = alloc["id"]
            assigned = alloc["monthly_allocation"]
            b_entry = db.query(models.CategoryMonthlyBudget).filter(
                models.CategoryMonthlyBudget.user_id == user.id,
                models.CategoryMonthlyBudget.category_id == cid,
                models.CategoryMonthlyBudget.month_year == month_str
            ).first()
            if b_entry:
                b_entry.budget_amount = assigned
                b_entry.allocation_mode = "auto"
            else:
                db.add(models.CategoryMonthlyBudget(
                    user_id=user.id,
                    category_id=cid,
                    month_year=month_str,
                    budget_amount=assigned,
                    allocation_mode="auto"
                ))
            c_row = db.query(models.Category).filter(models.Category.id == cid).first()
            if c_row:
                c_row.monthly_limit = assigned
                c_row.daily_limit = alloc["daily_limit"]

        if alloc_res.get("buffer_fund", 0) > 0:
            buf = db.query(models.BufferFund).filter(models.BufferFund.user_id == user.id).first()
            if buf:
                buf.monthly_buffer = alloc_res["buffer_fund"]
                buf.daily_buffer = round(alloc_res["buffer_fund"] / 30.0, 1)

        if alloc_res.get("investment_target", 0) > 0 and plan:
            plan.investment_target = alloc_res["investment_target"]

    db.commit()

    return {
        "message": f"Monthly income updated from ₹{old_income:,.0f} to ₹{payload.monthly_income:,.0f}",
        "monthly_income": payload.monthly_income,
        "allocation_mode": user.allocation_mode,
        "budget_summary": alloc_res
    }

@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    users = db.query(models.User).all()
    if not users:
        get_or_create_default_user(db)
        users = db.query(models.User).all()

    return [
        {
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "avatar": u.avatar,
            "role_title": u.role_title,
            "theme": u.theme or "dark"
        }
        for u in users
    ]
