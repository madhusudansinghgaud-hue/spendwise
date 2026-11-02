from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from database import get_db
import models

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


class ReallocationPayload(BaseModel):
    source_type: str = "category"  # "category" or "buffer"
    source_category_id: Optional[int] = None
    amount: float
    reason: Optional[str] = "Cover Expense Overage"


class ExpenseCreate(BaseModel):
    amount: float
    description: str = ""
    merchant: str = ""
    category_id: int
    date: Optional[datetime] = None
    source: str = "manual"
    upi_ref: str = ""
    notes: str = ""
    accept_over_budget: bool = False
    reallocation: Optional[ReallocationPayload] = None


class ExpenseCheckRequest(BaseModel):
    amount: float
    category_id: int
    date: Optional[datetime] = None


class ExpenseUpdate(BaseModel):
    amount: Optional[float] = None
    description: Optional[str] = None
    merchant: Optional[str] = None
    category_id: Optional[int] = None
    notes: Optional[str] = None


from routes.auth import get_current_user


@router.post("/check-limit")
def check_expense_limit(
    req: ExpenseCheckRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Pre-flight check before finalizing an expense.
    Checks whether adding this expense exceeds daily limit, monthly category budget,
    or per-transaction limits. Returns exact excess, remaining buffer, and transfer candidates.
    """
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Expense amount must be greater than 0")

    category = db.query(models.Category).filter(
        models.Category.id == req.category_id,
        models.Category.user_id == user.id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    target_dt = req.date or datetime.utcnow()
    target_date = target_dt.date()
    month_str = f"{target_date.year}-{target_date.month:02d}"

    # 1. Daily limit check
    daily_spent = db.query(func.sum(models.Expense.amount)).filter(
        models.Expense.user_id == user.id,
        models.Expense.category_id == category.id,
        func.date(models.Expense.date) == target_date
    ).scalar() or 0.0

    daily_limit = category.daily_limit or 0.0
    daily_remaining = max(0.0, daily_limit - daily_spent) if daily_limit > 0 else 0.0
    exceeded_daily = False
    daily_excess = 0.0
    if daily_limit > 0 and (daily_spent + req.amount) > daily_limit:
        exceeded_daily = True
        daily_excess = (daily_spent + req.amount) - daily_limit

    # 2. Monthly budget check
    budget_entry = db.query(models.CategoryMonthlyBudget).filter(
        models.CategoryMonthlyBudget.user_id == user.id,
        models.CategoryMonthlyBudget.category_id == category.id,
        models.CategoryMonthlyBudget.month_year == month_str
    ).first()
    monthly_budget = budget_entry.budget_amount if budget_entry else (category.monthly_limit or 0.0)

    m_start = datetime(target_date.year, target_date.month, 1)
    m_end = datetime(target_date.year + 1, 1, 1) if target_date.month == 12 else datetime(target_date.year, target_date.month + 1, 1)
    monthly_spent = db.query(func.sum(models.Expense.amount)).filter(
        models.Expense.user_id == user.id,
        models.Expense.category_id == category.id,
        models.Expense.date >= m_start,
        models.Expense.date < m_end
    ).scalar() or 0.0

    monthly_remaining = max(0.0, monthly_budget - monthly_spent) if monthly_budget > 0 else 0.0
    exceeded_monthly = False
    monthly_excess = 0.0
    if monthly_budget > 0 and (monthly_spent + req.amount) > monthly_budget:
        exceeded_monthly = True
        monthly_excess = (monthly_spent + req.amount) - monthly_budget

    # 3. Transaction limit check (for occasional)
    tx_limit = category.transaction_limit or 0.0
    exceeded_transaction = False
    if tx_limit > 0 and req.amount > tx_limit:
        exceeded_transaction = True

    # 4. Emergency buffer availability
    buffer_fund = db.query(models.BufferFund).filter(models.BufferFund.user_id == user.id).first()
    monthly_buf_limit = buffer_fund.monthly_buffer if buffer_fund else 3000.0
    buffer_used = db.query(func.sum(models.BufferUsage.amount)).filter(
        models.BufferUsage.user_id == user.id,
        models.BufferUsage.date >= m_start,
        models.BufferUsage.date < m_end
    ).scalar() or 0.0
    avail_buffer = max(0.0, monthly_buf_limit - buffer_used)

    # 5. Eligible transfer categories (other categories with remaining monthly budget)
    other_cats = db.query(models.Category).filter(
        models.Category.user_id == user.id,
        models.Category.id != category.id
    ).all()
    eligible_transfer_cats = []
    for oc in other_cats:
        oc_b_entry = db.query(models.CategoryMonthlyBudget).filter(
            models.CategoryMonthlyBudget.user_id == user.id,
            models.CategoryMonthlyBudget.category_id == oc.id,
            models.CategoryMonthlyBudget.month_year == month_str
        ).first()
        oc_budget = oc_b_entry.budget_amount if oc_b_entry else (oc.monthly_limit or 0.0)
        oc_spent = db.query(func.sum(models.Expense.amount)).filter(
            models.Expense.user_id == user.id,
            models.Expense.category_id == oc.id,
            models.Expense.date >= m_start,
            models.Expense.date < m_end
        ).scalar() or 0.0
        oc_avail = max(0.0, oc_budget - oc_spent)
        if oc_avail > 0:
            eligible_transfer_cats.append({
                "id": oc.id,
                "name": oc.name,
                "icon": oc.icon,
                "monthly_budget": oc_budget,
                "monthly_spent": oc_spent,
                "available": oc_avail
            })

    # Sort candidates by available funds descending
    eligible_transfer_cats.sort(key=lambda x: x["available"], reverse=True)

    return {
        "exceeded": exceeded_daily or exceeded_monthly or exceeded_transaction,
        "exceeded_daily": exceeded_daily,
        "daily_limit": daily_limit,
        "daily_spent": daily_spent,
        "daily_remaining": daily_remaining,
        "daily_excess": daily_excess,
        "exceeded_monthly": exceeded_monthly,
        "monthly_budget": monthly_budget,
        "monthly_spent": monthly_spent,
        "monthly_remaining": monthly_remaining,
        "monthly_excess": monthly_excess,
        "exceeded_transaction": exceeded_transaction,
        "transaction_limit": tx_limit,
        "category_id": category.id,
        "category_name": category.name,
        "category_icon": category.icon,
        "category_frequency": category.frequency or "monthly",
        "available_buffer": avail_buffer,
        "eligible_transfer_categories": eligible_transfer_cats
    }


@router.get("")
@router.get("/")
def get_expenses(
    skip: int = 0,
    limit: int = 50,
    category_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(models.Expense).filter(models.Expense.user_id == user.id)
    if category_id:
        query = query.filter(models.Expense.category_id == category_id)
    if start_date:
        query = query.filter(models.Expense.date >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        query = query.filter(models.Expense.date <= datetime.combine(end_date, datetime.max.time()))

    expenses = query.order_by(models.Expense.date.desc()).offset(skip).limit(limit).all()
    result = []
    for exp in expenses:
        result.append({
            "id": exp.id,
            "amount": exp.amount,
            "description": exp.description,
            "merchant": exp.merchant,
            "category_id": exp.category_id,
            "category_name": exp.category.name if exp.category else "",
            "category_icon": exp.category.icon if exp.category else "💰",
            "category_color": exp.category.color if exp.category else "#6366f1",
            "date": exp.date.isoformat(),
            "source": exp.source,
            "upi_ref": exp.upi_ref,
            "notes": exp.notes,
            "is_over_budget": exp.is_over_budget if hasattr(exp, 'is_over_budget') else False,
            "over_budget_type": exp.over_budget_type if hasattr(exp, 'over_budget_type') else "",
            "reallocation_note": exp.reallocation_note if hasattr(exp, 'reallocation_note') else ""
        })
    return result


@router.post("")
@router.post("/")
def create_expense(
    expense: ExpenseCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if expense.amount is None or expense.amount <= 0:
        raise HTTPException(status_code=400, detail="Expense amount must be a positive number greater than 0")

    category = db.query(models.Category).filter(
        models.Category.id == expense.category_id,
        models.Category.user_id == user.id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Selected category not found")

    target_dt = expense.date or datetime.utcnow()
    target_date = target_dt.date()
    month_str = f"{target_date.year}-{target_date.month:02d}"

    # Handle Reallocation if user requested one to cover excess
    realloc_note = ""
    if expense.reallocation and expense.reallocation.amount > 0:
        r = expense.reallocation
        if r.source_type == "category" and r.source_category_id:
            src = db.query(models.Category).filter(
                models.Category.id == r.source_category_id,
                models.Category.user_id == user.id
            ).first()
            if src:
                src_b_entry = db.query(models.CategoryMonthlyBudget).filter(
                    models.CategoryMonthlyBudget.user_id == user.id,
                    models.CategoryMonthlyBudget.category_id == src.id,
                    models.CategoryMonthlyBudget.month_year == month_str
                ).first()
                src_b = src_b_entry.budget_amount if src_b_entry else src.monthly_limit
                if src_b_entry:
                    src_b_entry.budget_amount = max(0.0, src_b - r.amount)
                else:
                    db.add(models.CategoryMonthlyBudget(
                        user_id=user.id,
                        category_id=src.id,
                        month_year=month_str,
                        budget_amount=max(0.0, src_b - r.amount),
                        allocation_mode="manual"
                    ))

                # Add to destination
                dst_b_entry = db.query(models.CategoryMonthlyBudget).filter(
                    models.CategoryMonthlyBudget.user_id == user.id,
                    models.CategoryMonthlyBudget.category_id == category.id,
                    models.CategoryMonthlyBudget.month_year == month_str
                ).first()
                dst_b = dst_b_entry.budget_amount if dst_b_entry else category.monthly_limit
                if dst_b_entry:
                    dst_b_entry.budget_amount = dst_b + r.amount
                else:
                    db.add(models.CategoryMonthlyBudget(
                        user_id=user.id,
                        category_id=category.id,
                        month_year=month_str,
                        budget_amount=dst_b + r.amount,
                        allocation_mode="manual"
                    ))

                db.add(models.BudgetReallocation(
                    user_id=user.id,
                    month_year=month_str,
                    source_type="category",
                    source_category_id=src.id,
                    destination_type="category",
                    destination_category_id=category.id,
                    amount=r.amount,
                    reason=r.reason or f"Covered overage for {category.name}"
                ))
                realloc_note = f"Covered ₹{r.amount:,.0f} from {src.name}"

        elif r.source_type == "buffer":
            db.add(models.BufferUsage(
                user_id=user.id,
                amount=r.amount,
                category_id=category.id,
                reason=f"Covered overage for {category.name}",
                date=target_dt
            ))
            # Increase category budget with buffer allocation
            dst_b_entry = db.query(models.CategoryMonthlyBudget).filter(
                models.CategoryMonthlyBudget.user_id == user.id,
                models.CategoryMonthlyBudget.category_id == category.id,
                models.CategoryMonthlyBudget.month_year == month_str
            ).first()
            dst_b = dst_b_entry.budget_amount if dst_b_entry else category.monthly_limit
            if dst_b_entry:
                dst_b_entry.budget_amount = dst_b + r.amount
            else:
                db.add(models.CategoryMonthlyBudget(
                    user_id=user.id,
                    category_id=category.id,
                    month_year=month_str,
                    budget_amount=dst_b + r.amount,
                    allocation_mode="manual"
                ))

            db.add(models.BudgetReallocation(
                user_id=user.id,
                month_year=month_str,
                source_type="buffer",
                source_category_id=None,
                destination_type="category",
                destination_category_id=category.id,
                amount=r.amount,
                reason=r.reason or f"Covered from Emergency Buffer"
            ))
            realloc_note = f"Covered ₹{r.amount:,.0f} from Emergency Buffer"

    # Evaluate whether over-budget
    daily_spent_prior = db.query(func.sum(models.Expense.amount)).filter(
        models.Expense.user_id == user.id,
        models.Expense.category_id == category.id,
        func.date(models.Expense.date) == target_date
    ).scalar() or 0.0
    daily_limit = category.daily_limit or 0.0
    is_daily_over = daily_limit > 0 and (daily_spent_prior + expense.amount) > daily_limit

    m_start = datetime(target_date.year, target_date.month, 1)
    m_end = datetime(target_date.year + 1, 1, 1) if target_date.month == 12 else datetime(target_date.year, target_date.month + 1, 1)
    monthly_spent_prior = db.query(func.sum(models.Expense.amount)).filter(
        models.Expense.user_id == user.id,
        models.Expense.category_id == category.id,
        models.Expense.date >= m_start,
        models.Expense.date < m_end
    ).scalar() or 0.0

    # Effective monthly budget (after any reallocation applied above)
    b_entry_eff = db.query(models.CategoryMonthlyBudget).filter(
        models.CategoryMonthlyBudget.user_id == user.id,
        models.CategoryMonthlyBudget.category_id == category.id,
        models.CategoryMonthlyBudget.month_year == month_str
    ).first()
    eff_monthly_b = b_entry_eff.budget_amount if b_entry_eff else (category.monthly_limit or 0.0)
    is_monthly_over = eff_monthly_b > 0 and (monthly_spent_prior + expense.amount) > eff_monthly_b

    is_over_budget = False
    over_budget_type = "none"
    if is_daily_over and is_monthly_over:
        is_over_budget = True
        over_budget_type = "both"
    elif is_daily_over:
        is_over_budget = True
        over_budget_type = "daily"
    elif is_monthly_over:
        is_over_budget = True
        over_budget_type = "monthly"

    expense_dict = {
        "amount": expense.amount,
        "description": expense.description or "",
        "merchant": expense.merchant or "",
        "category_id": expense.category_id,
        "date": target_dt,
        "source": expense.source or "manual",
        "upi_ref": expense.upi_ref or "",
        "notes": expense.notes or "",
        "is_over_budget": is_over_budget,
        "over_budget_type": over_budget_type,
        "reallocation_note": realloc_note
    }

    db_expense = models.Expense(**expense_dict, user_id=user.id)
    db.add(db_expense)

    try:
        db.flush()  # flush expense first so we get its id
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while saving expense: {str(e)}")

    # Update merchant mapping scoped to user (upsert, safe after index fix)
    if expense.merchant:
        try:
            mapping = db.query(models.MerchantMapping).filter(
                models.MerchantMapping.user_id == user.id,
                models.MerchantMapping.merchant_name == expense.merchant.strip().lower()
            ).first()
            if mapping:
                mapping.category_id = expense.category_id
                mapping.usage_count += 1
            else:
                new_mapping = models.MerchantMapping(
                    user_id=user.id,
                    merchant_name=expense.merchant.strip().lower(),
                    category_id=expense.category_id
                )
                db.add(new_mapping)
        except Exception:
            pass  # merchant mapping is non-critical; don't fail the expense save

    try:
        db.commit()
        db.refresh(db_expense)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while saving expense: {str(e)}")

    return {
        "expense": {
            "id": db_expense.id,
            "amount": db_expense.amount,
            "description": db_expense.description,
            "merchant": db_expense.merchant,
            "category_id": db_expense.category_id,
            "category_name": category.name,
            "category_icon": category.icon,
            "date": db_expense.date.isoformat(),
            "is_over_budget": db_expense.is_over_budget,
            "over_budget_type": db_expense.over_budget_type,
            "reallocation_note": db_expense.reallocation_note
        },
        "over_budget": is_over_budget,
        "over_budget_type": over_budget_type
    }



@router.put("/{expense_id}")
def update_expense(
    expense_id: int,
    expense: ExpenseUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.user_id == user.id
    ).first()
    if not db_expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    for key, value in expense.model_dump(exclude_unset=True).items():
        setattr(db_expense, key, value)
    db.commit()
    db.refresh(db_expense)
    return db_expense


@router.delete("/{expense_id}")
def delete_expense(
    expense_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.user_id == user.id
    ).first()
    if not db_expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete(db_expense)
    db.commit()
    return {"message": "Expense deleted"}


def extract_sms_details(sms_text: str, db: Session, user_id: int = 1):
    """Core logic to extract amount, merchant, ref, and match category for a user"""
    import re
    # Common Indian UPI SMS regex patterns
    amount_match = re.search(r'(?:INR|Rs\.?|₹)\s*(\d+(?:,\d+)*(?:\.\d{2})?)', sms_text, re.IGNORECASE)
    merchant_match = re.search(r'(?:to|at|vpa|paid to)\s+([A-Z0-9][A-Za-z0-9\s&\.\-_]+?)(?:\s+on|\s+via|\s+Ref|\.|$)', sms_text, re.IGNORECASE)
    ref_match = re.search(r'(?:Ref|UPI Ref|Ref No\.?|UPI Ref No\.?)\s*[:\.]?\s*(\d+)', sms_text, re.IGNORECASE)

    if not amount_match:
        return None

    amount = float(amount_match.group(1).replace(',', ''))
    merchant = merchant_match.group(1).strip() if merchant_match else ""
    upi_ref = ref_match.group(1) if ref_match else ""

    # Smart keyword to category matching
    matched_category_id = None
    lower_text = sms_text.lower()
    lower_merchant = merchant.lower()

    if merchant:
        mapping = db.query(models.MerchantMapping).filter(
            models.MerchantMapping.merchant_name == lower_merchant
        ).first()
        if mapping:
            matched_category_id = mapping.category_id

    categories = db.query(models.Category).filter(models.Category.user_id == user_id).all()
    if not categories:
        categories = db.query(models.Category).all()
    cat_map = {c.name.lower(): c.id for c in categories}

    if not matched_category_id:
        # Keywords rules
        if any(w in lower_text or w in lower_merchant for w in ["cigt", "cigarette", "smoke", "paan", "tobacco", "marlboro", "flaker"]):
            matched_category_id = cat_map.get("cigarettes") or cat_map.get("habits") or cat_map.get("habits / personal")
        elif any(w in lower_text or w in lower_merchant for w in ["chai", "tea", "coffee", "starbucks", "beverage", "cafe", "beer", "drink", "juice"]):
            matched_category_id = cat_map.get("beverages") or cat_map.get("coffee & beverages")
        elif any(w in lower_text or w in lower_merchant for w in ["swiggy", "zomato", "mcdonald", "burger", "pizza", "restaurant", "food", "eat", "dining", "biryani"]):
            matched_category_id = cat_map.get("food") or cat_map.get("food & dining")
        elif any(w in lower_text or w in lower_merchant for w in ["blinkit", "zepto", "instamart", "dmart", "groceries", "supermarket", "provision", "kirana", "veggies", "fruits"]):
            matched_category_id = cat_map.get("groceries")
        elif any(w in lower_text or w in lower_merchant for w in ["uber", "ola", "rapido", "metro", "fuel", "petrol", "diesel", "transport", "auto"]):
            matched_category_id = cat_map.get("transport") or cat_map.get("transport & fuel")
        elif any(w in lower_text or w in lower_merchant for w in ["netflix", "spotify", "pvr", "inox", "steam", "movie", "game"]):
            matched_category_id = cat_map.get("entertainment") or cat_map.get("entertainment & fun")

    if not matched_category_id:
        first_cat = categories[0] if categories else None
        matched_category_id = first_cat.id if first_cat else 1

    matched_cat = db.query(models.Category).filter(models.Category.id == matched_category_id).first()

    return {
        "amount": amount,
        "merchant": merchant,
        "upi_ref": upi_ref,
        "category_id": matched_category_id,
        "category": {
            "id": matched_cat.id,
            "name": matched_cat.name,
            "icon": matched_cat.icon,
            "color": matched_cat.color,
            "daily_limit": matched_cat.daily_limit
        } if matched_cat else None
    }


@router.post("/parse-sms")
def parse_sms(
    payload: dict,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Parse a UPI SMS and return extracted details"""
    sms_text = payload.get("sms") or payload.get("text") or payload.get("message") or ""
    if not sms_text:
        raise HTTPException(status_code=400, detail="SMS content is required")

    details = extract_sms_details(sms_text, db, user.id)
    if not details:
        raise HTTPException(status_code=400, detail="Could not detect amount or UPI transaction from text")

    return {
        "amount": details["amount"],
        "merchant": details["merchant"],
        "upi_ref": details["upi_ref"],
        "suggested_category": details["category"]
    }


@router.post("/webhook")
def phone_sms_webhook(
    payload: dict,
    username: Optional[str] = Query(None),
    x_username: Optional[str] = Header(None, alias="X-Username"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """
    Webhook for Phone Automation (MacroDroid / Tasker / SMS Forwarder).
    Automatically saves transaction, checks quota, and returns smart alerts!
    """
    sms_text = (
        payload.get("sms") or 
        payload.get("text") or 
        payload.get("message") or 
        payload.get("body") or 
        payload.get("content") or ""
    )
    sender = payload.get("sender") or payload.get("from") or "Phone SMS"

    if not sms_text:
        raise HTTPException(status_code=400, detail="No SMS text provided in webhook payload")

    # Resolve target user
    user = None
    target_uid = payload.get("user_id") or x_user_id
    target_uname = payload.get("username") or username or x_username

    if target_uid:
        user = db.query(models.User).filter(models.User.id == int(target_uid)).first()
    if not user and target_uname:
        user = db.query(models.User).filter(models.User.username == target_uname.lower().strip()).first()
    if not user:
        user = db.query(models.User).order_by(models.User.id.desc()).first()

    user_id = user.id if user else 1

    details = extract_sms_details(sms_text, db, user_id)
    if not details:
        return {"status": "ignored", "message": "SMS did not match a debit transaction"}

    cat_id = details["category_id"]
    category = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if not category:
        category = db.query(models.Category).filter(models.Category.user_id == user_id).first()
        cat_id = category.id if category else 1

    db_expense = models.Expense(
        amount=details["amount"],
        description=f"Auto-logged via {sender}",
        merchant=details["merchant"] or sender,
        category_id=cat_id,
        source="sms_auto",
        upi_ref=details["upi_ref"],
        notes=f"Original SMS: {sms_text[:120]}",
        user_id=user_id
    )
    db.add(db_expense)

    if details["merchant"]:
        mapping = db.query(models.MerchantMapping).filter(
            models.MerchantMapping.merchant_name == details["merchant"].lower()
        ).first()
        if mapping:
            mapping.category_id = cat_id
            mapping.usage_count += 1
        else:
            db.add(models.MerchantMapping(
                merchant_name=details["merchant"].lower(),
                category_id=cat_id
            ))

    db.commit()
    db.refresh(db_expense)

    # Check daily quota for this user
    today = date.today()
    daily_spent = db.query(func.sum(models.Expense.amount)).filter(
        models.Expense.user_id == user_id,
        models.Expense.category_id == cat_id,
        func.date(models.Expense.date) == today
    ).scalar() or 0.0

    alert = None
    if category and category.daily_limit > 0 and daily_spent >= category.daily_limit:
        excess = daily_spent - category.daily_limit
        fund = db.query(models.BufferFund).filter(models.BufferFund.user_id == user_id).first()
        daily_buffer_limit = fund.daily_buffer if fund else 150.0
        used_buffer = db.query(func.sum(models.BufferUsage.amount)).filter(
            models.BufferUsage.user_id == user_id,
            func.date(models.BufferUsage.date) == today
        ).scalar() or 0.0
        buf_avail = max(0.0, daily_buffer_limit - used_buffer)

        alert = {
            "type": "daily_exceeded",
            "category": category.name,
            "icon": category.icon,
            "limit": category.daily_limit,
            "spent": daily_spent,
            "excess": excess,
            "buffer_available": buf_avail
        }

    return {
        "status": "success",
        "message": f"Successfully auto-recorded ₹{db_expense.amount} for {category.name if category else 'General'}",
        "user_id": user_id,
        "expense": {
            "id": db_expense.id,
            "amount": db_expense.amount,
            "merchant": db_expense.merchant,
            "category": category.name if category else "",
            "icon": category.icon if category else "💰"
        },
        "alert": alert
    }

