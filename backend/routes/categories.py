from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from database import get_db
import models
from routes.auth import get_current_user

import budget_engine

router = APIRouter(prefix="/api/categories", tags=["categories"])


class CategoryCreate(BaseModel):
    name: str
    icon: str = "💰"
    color: str = "#6366f1"
    daily_limit: float = 0.0
    monthly_limit: float = 0.0
    frequency: str = "monthly"  # "daily", "weekly", "monthly", "occasional"
    expected_frequency: str = ""  # e.g. "2 times a month", "as needed"
    transaction_limit: float = 0.0  # Optional per-transaction limit
    is_essential: bool = True
    priority: int = 1
    allocation_mode: str = "auto"


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    daily_limit: Optional[float] = None
    monthly_limit: Optional[float] = None
    frequency: Optional[str] = None
    expected_frequency: Optional[str] = None
    transaction_limit: Optional[float] = None
    is_essential: Optional[bool] = None
    priority: Optional[int] = None
    allocation_mode: Optional[str] = None


class MonthlyBudgetAdjust(BaseModel):
    category_id: int
    month_year: str  # "YYYY-MM"
    budget_amount: float
    allocation_mode: str = "manual"
    update_default: bool = True


class ReallocationRequest(BaseModel):
    source_type: str = "category"  # "category" or "buffer"
    source_category_id: Optional[int] = None
    destination_category_id: int
    amount: float
    reason: Optional[str] = "Manual Reallocation"
    month_year: Optional[str] = None



class BatchMonthlyBudgetAdjust(BaseModel):
    month_year: str
    budgets: List[dict]  # [{"category_id": int, "budget_amount": float, "allocation_mode": "manual"}]
    update_default: bool = True


class AutoAllocateRequest(BaseModel):
    month_year: Optional[str] = None
    monthly_income: Optional[float] = None
    apply_changes: bool = True



@router.get("")
@router.get("/")
def get_categories(
    month: Optional[str] = None,  # "YYYY-MM"
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    today = date.today()
    if month:
        try:
            parts = month.split("-")
            target_year = int(parts[0])
            target_month = int(parts[1])
            month_start = datetime(target_year, target_month, 1)
            month_end = datetime(target_year + 1, 1, 1) if target_month == 12 else datetime(target_year, target_month + 1, 1)
            target_month_str = month
        except Exception:
            month_start = datetime(today.year, today.month, 1)
            target_month = today.month
            target_year = today.year
            month_end = datetime(target_year + 1, 1, 1) if target_month == 12 else datetime(target_year, target_month + 1, 1)
            target_month_str = f"{today.year}-{today.month:02d}"
    else:
        month_start = datetime(today.year, today.month, 1)
        target_month = today.month
        target_year = today.year
        month_end = datetime(target_year + 1, 1, 1) if target_month == 12 else datetime(target_year, target_month + 1, 1)
        target_month_str = f"{today.year}-{today.month:02d}"

    categories = db.query(models.Category).filter(models.Category.user_id == user.id).all()
    result = []

    for cat in categories:
        # Check if month-specific budget override exists
        monthly_budget_entry = db.query(models.CategoryMonthlyBudget).filter(
            models.CategoryMonthlyBudget.user_id == user.id,
            models.CategoryMonthlyBudget.category_id == cat.id,
            models.CategoryMonthlyBudget.month_year == target_month_str
        ).first()

        effective_monthly_budget = monthly_budget_entry.budget_amount if monthly_budget_entry else cat.monthly_limit

        # Today's spent (if current month)
        daily_spent = 0.0
        if target_year == today.year and target_month == today.month:
            daily_spent = db.query(func.sum(models.Expense.amount)).filter(
                models.Expense.user_id == user.id,
                models.Expense.category_id == cat.id,
                func.date(models.Expense.date) == today
            ).scalar() or 0.0

        # Monthly spent for target month
        monthly_spent = db.query(func.sum(models.Expense.amount)).filter(
            models.Expense.user_id == user.id,
            models.Expense.category_id == cat.id,
            models.Expense.date >= month_start,
            models.Expense.date < month_end
        ).scalar() or 0.0

        remaining = effective_monthly_budget - monthly_spent
        exceeded = effective_monthly_budget > 0 and monthly_spent > effective_monthly_budget
        excess = max(0.0, monthly_spent - effective_monthly_budget)

        daily_limit_val = cat.daily_limit or 0.0
        daily_remaining = max(0.0, daily_limit_val - daily_spent) if daily_limit_val > 0 else 0.0

        result.append({
            "id": cat.id,
            "name": cat.name,
            "icon": cat.icon,
            "color": cat.color,
            "frequency": cat.frequency if hasattr(cat, 'frequency') and cat.frequency else "monthly",
            "expected_frequency": cat.expected_frequency if hasattr(cat, 'expected_frequency') and cat.expected_frequency else "",
            "transaction_limit": cat.transaction_limit if hasattr(cat, 'transaction_limit') and cat.transaction_limit else 0.0,
            "daily_limit": daily_limit_val,
            "monthly_limit": effective_monthly_budget,
            "default_monthly_limit": cat.monthly_limit,
            "is_essential": cat.is_essential if hasattr(cat, 'is_essential') and cat.is_essential is not None else True,
            "priority": cat.priority if hasattr(cat, 'priority') and cat.priority is not None else 1,
            "allocation_mode": (monthly_budget_entry.allocation_mode if monthly_budget_entry and hasattr(monthly_budget_entry, 'allocation_mode') else (cat.allocation_mode or "auto")),
            "daily_spent": daily_spent,
            "daily_remaining": daily_remaining,
            "monthly_spent": monthly_spent,
            "remaining": remaining,
            "excess": excess,
            "daily_percent": (daily_spent / daily_limit_val * 100) if daily_limit_val > 0 else 0,
            "monthly_percent": (monthly_spent / effective_monthly_budget * 100) if effective_monthly_budget > 0 else 0,
            "daily_exceeded": daily_limit_val > 0 and daily_spent > daily_limit_val,
            "monthly_exceeded": exceeded,
            "month_year": target_month_str,
            "created_at": cat.created_at.isoformat()
        })
    return result


@router.get("/overview")
def get_categories_overview(
    month: Optional[str] = None,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns comprehensive financial profile with categories and budget constraints"""
    return budget_engine.get_user_financial_profile(db, user, month)


@router.post("")
@router.post("/")
def create_category(
    category: CategoryCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    existing = db.query(models.Category).filter(
        models.Category.user_id == user.id,
        models.Category.name == category.name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists for this user")
    
    cat_dict = category.model_dump()
    if not cat_dict.get("priority"):
        p, e = budget_engine.classify_category_priority(category.name)
        cat_dict["priority"] = p
        cat_dict["is_essential"] = e

    db_cat = models.Category(**cat_dict, user_id=user.id)
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return db_cat


@router.post("/monthly-budget")
def adjust_monthly_budget(
    data: MonthlyBudgetAdjust,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Adjust monthly budget for a specific category in a specific month.
    Persistently saved in CategoryMonthlyBudget table.
    Validates against user's available monthly income.
    """
    cat = db.query(models.Category).filter(
        models.Category.id == data.category_id,
        models.Category.user_id == user.id
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    budget_entry = db.query(models.CategoryMonthlyBudget).filter(
        models.CategoryMonthlyBudget.user_id == user.id,
        models.CategoryMonthlyBudget.category_id == data.category_id,
        models.CategoryMonthlyBudget.month_year == data.month_year
    ).first()

    if budget_entry:
        budget_entry.budget_amount = data.budget_amount
        budget_entry.allocation_mode = data.allocation_mode
    else:
        budget_entry = models.CategoryMonthlyBudget(
            user_id=user.id,
            category_id=data.category_id,
            month_year=data.month_year,
            budget_amount=data.budget_amount,
            allocation_mode=data.allocation_mode
        )
        db.add(budget_entry)

    cat.allocation_mode = data.allocation_mode
    if data.update_default:
        cat.monthly_limit = data.budget_amount

    db.commit()

    # Recalculate total planned budget for the month
    all_cats = db.query(models.Category).filter(models.Category.user_id == user.id).all()
    total_planned = 0.0
    for c in all_cats:
        b = db.query(models.CategoryMonthlyBudget).filter(
            models.CategoryMonthlyBudget.user_id == user.id,
            models.CategoryMonthlyBudget.category_id == c.id,
            models.CategoryMonthlyBudget.month_year == data.month_year
        ).first()
        total_planned += (b.budget_amount if b else c.monthly_limit)

    plan = db.query(models.InvestmentPlan).filter(
        models.InvestmentPlan.user_id == user.id,
        models.InvestmentPlan.is_active == True
    ).first()
    monthly_income = user.monthly_income if (user.monthly_income and user.monthly_income > 0) else (plan.monthly_salary if plan else 50000.0)

    shortfall = max(0.0, total_planned - monthly_income)
    warning = None
    if shortfall > 0:
        warning = f"Your planned budget exceeds your available income by ₹{shortfall:,.0f}. Reduce one or more allocations to continue."

    return {
        "message": f"Updated budget for {cat.name} to ₹{data.budget_amount:,.0f} for {data.month_year}",
        "category_id": cat.id,
        "month_year": data.month_year,
        "budget_amount": data.budget_amount,
        "total_planned": total_planned,
        "monthly_income": monthly_income,
        "shortfall": shortfall,
        "warning": warning
    }


@router.post("/rebalance-budget")
def rebalance_monthly_budget(
    payload: AutoAllocateRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Intelligently rebalance all category budgets using the Income-Based Budget Allocation Engine.
    Ensures total planned budget <= available monthly income.
    """
    today = date.today()
    month_str = payload.month_year or f"{today.year}-{today.month:02d}"

    plan = db.query(models.InvestmentPlan).filter(
        models.InvestmentPlan.user_id == user.id,
        models.InvestmentPlan.is_active == True
    ).first()
    income = payload.monthly_income or (user.monthly_income if (user.monthly_income and user.monthly_income > 0) else (plan.monthly_salary if plan else 50000.0))

    categories = db.query(models.Category).filter(models.Category.user_id == user.id).all()
    cat_dicts = [
        {
            "id": c.id,
            "name": c.name,
            "icon": c.icon,
            "color": c.color,
            "is_essential": c.is_essential if hasattr(c, 'is_essential') and c.is_essential is not None else True,
            "priority": c.priority if hasattr(c, 'priority') and c.priority is not None else 1,
            "monthly_limit": c.monthly_limit
        }
        for c in categories
    ]

    allocation_res = budget_engine.calculate_budget_allocation(
        monthly_income=income,
        categories=cat_dicts
    )

    if payload.apply_changes:
        for alloc in allocation_res["allocations"]:
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
            # Also update category default
            c_row = db.query(models.Category).filter(models.Category.id == cid).first()
            if c_row:
                c_row.monthly_limit = assigned
                c_row.daily_limit = alloc["daily_limit"]

        # Update buffer fund if recommended
        if allocation_res.get("buffer_fund", 0) > 0:
            buf = db.query(models.BufferFund).filter(models.BufferFund.user_id == user.id).first()
            if buf:
                buf.monthly_buffer = allocation_res["buffer_fund"]
                buf.daily_buffer = round(allocation_res["buffer_fund"] / 30.0, 1)

        # Update investment plan target if recommended
        if allocation_res.get("investment_target", 0) > 0 and plan:
            plan.investment_target = allocation_res["investment_target"]
            plan.monthly_salary = income

        user.monthly_income = income
        db.commit()

    return {
        "message": f"Budget successfully rebalanced for {month_str} based on ₹{income:,.0f} income!",
        "result": allocation_res
    }



@router.post("/batch-monthly-budget")
def batch_adjust_monthly_budgets(
    data: BatchMonthlyBudgetAdjust,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Batch adjust multiple category budgets for a month"""
    updated = []
    for item in data.budgets:
        cid = item.get("category_id")
        amount = float(item.get("budget_amount", 0))
        if not cid or amount < 0:
            continue

        cat = db.query(models.Category).filter(
            models.Category.id == cid,
            models.Category.user_id == user.id
        ).first()
        if not cat:
            continue

        budget_entry = db.query(models.CategoryMonthlyBudget).filter(
            models.CategoryMonthlyBudget.user_id == user.id,
            models.CategoryMonthlyBudget.category_id == cid,
            models.CategoryMonthlyBudget.month_year == data.month_year
        ).first()

        if budget_entry:
            budget_entry.budget_amount = amount
        else:
            budget_entry = models.CategoryMonthlyBudget(
                user_id=user.id,
                category_id=cid,
                month_year=data.month_year,
                budget_amount=amount
            )
            db.add(budget_entry)

        if data.update_default:
            cat.monthly_limit = amount

        updated.append({"category": cat.name, "budget": amount})

    db.commit()
    return {
        "message": f"Successfully updated budgets for {len(updated)} categories for {data.month_year}",
        "updated": updated
    }


@router.put("/{category_id}")
def update_category(
    category_id: int,
    category: CategoryUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_cat = db.query(models.Category).filter(
        models.Category.id == category_id,
        models.Category.user_id == user.id
    ).first()
    if not db_cat:
        raise HTTPException(status_code=404, detail="Category not found")
    for key, value in category.model_dump(exclude_unset=True).items():
        setattr(db_cat, key, value)
    db.commit()
    db.refresh(db_cat)
    return db_cat


@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_cat = db.query(models.Category).filter(
        models.Category.id == category_id,
        models.Category.user_id == user.id
    ).first()
    if not db_cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(db_cat)
    db.commit()
    return {"message": "Category deleted"}


@router.post("/rebalance")
def rebalance_categories(payload: dict, db: Session = Depends(get_db)):
    adjustments = payload.get("adjustments", [])
    results = []
    total_rebalanced = 0.0

    for adj in adjustments:
        cid = adj.get("category_id")
        reduce_by = float(adj.get("reduce_by", 0))
        if reduce_by <= 0 or not cid:
            continue

        cat = db.query(models.Category).filter(models.Category.id == cid).first()
        if cat and cat.daily_limit > 0:
            original = cat.daily_limit
            new_limit = max(0.0, cat.daily_limit - reduce_by)
            cat.daily_limit = new_limit
            total_rebalanced += reduce_by
            results.append({
                "category_id": cat.id,
                "category_name": cat.name,
                "previous_limit": original,
                "new_limit": new_limit,
                "reduced_by": reduce_by
            })

    db.commit()
    return {
        "message": f"Successfully rebalanced ₹{total_rebalanced:.0f} across categories!",
        "total_rebalanced": total_rebalanced,
        "adjustments": results
    }


@router.post("/reallocate")
def reallocate_budget(
    data: ReallocationRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Reallocate budget between two categories or from emergency buffer to a category.
    Never increases total planned budget.
    Records history in budget_reallocations table.
    """
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Reallocation amount must be greater than 0")

    today = date.today()
    month_str = data.month_year or f"{today.year}-{today.month:02d}"

    # Destination category
    dst_cat = db.query(models.Category).filter(
        models.Category.id == data.destination_category_id,
        models.Category.user_id == user.id
    ).first()
    if not dst_cat:
        raise HTTPException(status_code=404, detail="Destination category not found")

    dst_budget_entry = db.query(models.CategoryMonthlyBudget).filter(
        models.CategoryMonthlyBudget.user_id == user.id,
        models.CategoryMonthlyBudget.category_id == dst_cat.id,
        models.CategoryMonthlyBudget.month_year == month_str
    ).first()
    dst_current_budget = dst_budget_entry.budget_amount if dst_budget_entry else (dst_cat.monthly_limit or 0.0)

    source_name = "Emergency Buffer"
    source_icon = "🛡️"
    source_orig_budget = 0.0
    source_new_budget = 0.0

    if data.source_type == "category":
        if not data.source_category_id:
            raise HTTPException(status_code=400, detail="Source category ID required for category reallocation")
        if data.source_category_id == data.destination_category_id:
            raise HTTPException(status_code=400, detail="Source and destination categories must be different")

        src_cat = db.query(models.Category).filter(
            models.Category.id == data.source_category_id,
            models.Category.user_id == user.id
        ).first()
        if not src_cat:
            raise HTTPException(status_code=404, detail="Source category not found")

        source_name = src_cat.name
        source_icon = src_cat.icon
        src_budget_entry = db.query(models.CategoryMonthlyBudget).filter(
            models.CategoryMonthlyBudget.user_id == user.id,
            models.CategoryMonthlyBudget.category_id == src_cat.id,
            models.CategoryMonthlyBudget.month_year == month_str
        ).first()
        src_current_budget = src_budget_entry.budget_amount if src_budget_entry else (src_cat.monthly_limit or 0.0)
        source_orig_budget = src_current_budget

        if src_current_budget < data.amount:
            raise HTTPException(
                status_code=400,
                detail=f"Source category '{src_cat.name}' has budget ₹{src_current_budget:,.0f}, cannot transfer ₹{data.amount:,.0f}"
            )

        new_src_budget = src_current_budget - data.amount
        source_new_budget = new_src_budget
        if src_budget_entry:
            src_budget_entry.budget_amount = new_src_budget
            src_budget_entry.allocation_mode = "manual"
        else:
            db.add(models.CategoryMonthlyBudget(
                user_id=user.id,
                category_id=src_cat.id,
                month_year=month_str,
                budget_amount=new_src_budget,
                allocation_mode="manual"
            ))

    elif data.source_type == "buffer":
        buf = db.query(models.BufferFund).filter(models.BufferFund.user_id == user.id).first()
        if not buf:
            buf = models.BufferFund(user_id=user.id, monthly_buffer=3000.0, daily_buffer=100.0)
            db.add(buf)
            db.flush()

        parts = month_str.split("-")
        y, m = int(parts[0]), int(parts[1])
        m_start = datetime(y, m, 1)
        m_end = datetime(y + 1, 1, 1) if m == 12 else datetime(y, m + 1, 1)

        used_buffer = db.query(func.sum(models.BufferUsage.amount)).filter(
            models.BufferUsage.user_id == user.id,
            models.BufferUsage.date >= m_start,
            models.BufferUsage.date < m_end
        ).scalar() or 0.0
        avail_buffer = max(0.0, buf.monthly_buffer - used_buffer)
        source_orig_budget = avail_buffer

        if avail_buffer < data.amount:
            raise HTTPException(
                status_code=400,
                detail=f"Emergency buffer only has ₹{avail_buffer:,.0f} available, cannot cover ₹{data.amount:,.0f}"
            )

        # Log buffer usage
        db.add(models.BufferUsage(
            user_id=user.id,
            amount=data.amount,
            category_id=dst_cat.id,
            reason=f"Cover {dst_cat.name}: {data.reason or 'Budget coverage'}",
            date=datetime.utcnow()
        ))
        source_new_budget = avail_buffer - data.amount
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported source type: {data.source_type}")

    # Add to destination
    new_dst_budget = dst_current_budget + data.amount
    if dst_budget_entry:
        dst_budget_entry.budget_amount = new_dst_budget
        dst_budget_entry.allocation_mode = "manual"
    else:
        db.add(models.CategoryMonthlyBudget(
            user_id=user.id,
            category_id=dst_cat.id,
            month_year=month_str,
            budget_amount=new_dst_budget,
            allocation_mode="manual"
        ))

    realloc_record = models.BudgetReallocation(
        user_id=user.id,
        month_year=month_str,
        source_type=data.source_type,
        source_category_id=data.source_category_id if data.source_type == "category" else None,
        destination_type="category",
        destination_category_id=dst_cat.id,
        amount=data.amount,
        reason=data.reason or "Budget Reallocation"
    )
    db.add(realloc_record)
    db.commit()

    return {
        "message": f"Successfully moved ₹{data.amount:,.0f} from {source_name} to {dst_cat.name}",
        "source": {
            "type": data.source_type,
            "name": source_name,
            "icon": source_icon,
            "original_budget": source_orig_budget,
            "new_budget": source_new_budget
        },
        "destination": {
            "id": dst_cat.id,
            "name": dst_cat.name,
            "icon": dst_cat.icon,
            "original_budget": dst_current_budget,
            "new_budget": new_dst_budget
        },
        "amount": data.amount,
        "month_year": month_str
    }


@router.get("/reallocations")
def get_reallocations(
    month: Optional[str] = None,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(models.BudgetReallocation).filter(models.BudgetReallocation.user_id == user.id)
    if month:
        query = query.filter(models.BudgetReallocation.month_year == month)
    records = query.order_by(models.BudgetReallocation.created_at.desc()).all()

    items = []
    for r in records:
        src_name = "Emergency Buffer"
        src_icon = "🛡️"
        if r.source_type == "category" and r.source_category:
            src_name = r.source_category.name
            src_icon = r.source_category.icon

        dst_name = r.destination_category.name if r.destination_category else "Category"
        dst_icon = r.destination_category.icon if r.destination_category else "💰"

        items.append({
            "id": r.id,
            "month_year": r.month_year,
            "source_type": r.source_type,
            "source_name": src_name,
            "source_icon": src_icon,
            "destination_name": dst_name,
            "destination_icon": dst_icon,
            "amount": r.amount,
            "reason": r.reason,
            "created_at": r.created_at.isoformat()
        })
    return items

