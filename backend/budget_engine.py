"""
SpendWise Centralized Income-Based Budget Allocation Engine
===========================================================
Implements mathematical allocation rules, priority-based distribution,
and strict non-exceedance constraints against available monthly income.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, date
from sqlalchemy.orm import Session
from sqlalchemy import func
import models


# Priority tiers
PRIORITY_ESSENTIAL = 1     # Rent, Utilities, Groceries, Healthcare, Education, Transport
PRIORITY_RECURRING = 2     # Mobile, Internet, Subscriptions, Insurance
PRIORITY_BUFFER = 3        # Emergency Buffer fund
PRIORITY_INVESTMENT = 4    # Investments (SIP, Stocks, Gold, etc.)
PRIORITY_SAVINGS = 5       # Savings goals / Cash savings
PRIORITY_DISCRETIONARY = 6 # Food & Dining, Entertainment, Shopping, Personal care, Other


# Category classification keywords for intelligent classification
ESSENTIAL_KEYWORDS = [
    "rent", "grocer", "utilit", "fuel", "transport", "electric",
    "water", "gas", "health", "medic", "doctor", "educat", "school",
    "tuition", "maintenance", "emi", "loan"
]

RECURRING_KEYWORDS = [
    "mobile", "internet", "wifi", "bill", "subscription", "insurance"
]

DISCRETIONARY_KEYWORDS = [
    "dining", "food", "restaurant", "cafe", "beverage", "coffee",
    "entertain", "movie", "game", "shopping", "cloth", "habit",
    "personal", "leisure", "hobby", "vacation", "party"
]


def classify_category_priority(name: str) -> tuple[int, bool]:
    """
    Returns (priority_int, is_essential_bool) based on category name.
    """
    lname = name.lower()
    for kw in ESSENTIAL_KEYWORDS:
        if kw in lname:
            return PRIORITY_ESSENTIAL, True
    for kw in RECURRING_KEYWORDS:
        if kw in lname:
            return PRIORITY_RECURRING, True
    if "buffer" in lname or "emergency" in lname:
        return PRIORITY_BUFFER, True
    if "invest" in lname or "sip" in lname:
        return PRIORITY_INVESTMENT, False
    if "saving" in lname:
        return PRIORITY_SAVINGS, False
    for kw in DISCRETIONARY_KEYWORDS:
        if kw in lname:
            return PRIORITY_DISCRETIONARY, False
    return PRIORITY_DISCRETIONARY, False


# Recommended baseline weight distributions when user selects categories
CATEGORY_WEIGHT_BASELINES = {
    "rent": 0.35,
    "grocer": 0.25,
    "fuel": 0.10,
    "transport": 0.10,
    "utilit": 0.08,
    "mobile": 0.05,
    "internet": 0.05,
    "health": 0.08,
    "educat": 0.10,
    "personal": 0.07,
    "dining": 0.08,
    "food": 0.10,
    "shopping": 0.06,
    "entertain": 0.05,
    "care": 0.05,
    "buffer": 0.10,
    "emergency": 0.10,
    "invest": 0.10,
    "saving": 0.10
}


def get_category_baseline_weight(name: str) -> float:
    lname = name.lower()
    for kw, weight in CATEGORY_WEIGHT_BASELINES.items():
        if kw in lname:
            return weight
    return 0.06


def calculate_budget_allocation(
    monthly_income: float,
    other_income: float = 0.0,
    existing_obligations: float = 0.0,
    categories: Optional[List[Dict[str, Any]]] = None,
    buffer_percentage: float = 0.10,
    investment_percentage: float = 0.10,
    savings_percentage: float = 0.10,
    reserve_target_percentage: float = 0.10
) -> Dict[str, Any]:
    """
    Calculates an income-aware budget allocation ensuring:
    Total planned allocation <= Available monthly income.

    Available Income = Monthly Income + Other Income - Existing Obligations
    """
    available_income = max(0.0, monthly_income + other_income - existing_obligations)
    if available_income <= 0:
        return {
            "monthly_income": monthly_income,
            "other_income": other_income,
            "existing_obligations": existing_obligations,
            "available_income": 0.0,
            "total_allocated": 0.0,
            "unallocated_reserve": 0.0,
            "shortfall": 0.0,
            "allocations": [],
            "buffer_fund": 0.0,
            "investment_target": 0.0,
            "savings_target": 0.0,
            "warning": "Available income is zero or negative after deducting obligations."
        }

    cats = categories or []
    if not cats:
        rec_buf = round(available_income * buffer_percentage, 0)
        rec_inv = round(available_income * investment_percentage, 0)
        rec_sav = round(available_income * savings_percentage, 0)
        unalloc = max(0.0, available_income - (rec_buf + rec_inv + rec_sav))
        return {
            "monthly_income": monthly_income,
            "other_income": other_income,
            "existing_obligations": existing_obligations,
            "available_income": available_income,
            "total_allocated": 0.0,
            "unallocated_reserve": unalloc,
            "shortfall": 0.0,
            "allocations": [],
            "buffer_fund": rec_buf,
            "investment_target": rec_inv,
            "savings_target": rec_sav,
            "total_planned_with_goals": rec_buf + rec_inv + rec_sav,
            "warning": None
        }

    # 1. Identify explicit Rent or Fixed Obligations within categories if provided
    prepared = []
    has_rent = False
    rent_request = 0.0

    for c in cats:
        name = c.get("name", "Category")
        priority = c.get("priority")
        is_essential = c.get("is_essential")
        if priority is None or is_essential is None:
            auto_p, auto_e = classify_category_priority(name)
            priority = priority if priority is not None else auto_p
            is_essential = is_essential if is_essential is not None else auto_e

        user_req = float(c.get("monthly_limit", 0) or 0)
        if "rent" in name.lower() and user_req > 0:
            has_rent = True
            rent_request = user_req

        prepared.append({
            "id": c.get("id"),
            "name": name,
            "icon": c.get("icon", "🏷️"),
            "color": c.get("color", "#6366f1"),
            "is_essential": is_essential,
            "priority": priority,
            "allocation_mode": c.get("allocation_mode", "auto"),
            "user_requested": user_req,
            "base_weight": get_category_baseline_weight(name)
        })

    # Available income left for variable pool after rent
    rent_allocation = min(available_income * 0.60, rent_request) if has_rent else 0.0
    variable_income_pool = available_income - rent_allocation

    # Determine goal targets
    rec_buffer = round(available_income * buffer_percentage, 0)
    rec_investment = round(available_income * investment_percentage, 0)
    rec_savings = round(available_income * savings_percentage, 0)

    # If rent is high (e.g. 40%+ of income), scale goals down slightly to keep spending realistic
    if rent_allocation > (available_income * 0.35):
        scale_factor = max(0.5, (available_income - rent_allocation) / (available_income * 0.65))
        rec_buffer = round(rec_buffer * scale_factor, 0)
        rec_investment = round(rec_investment * scale_factor, 0)
        rec_savings = round(rec_savings * scale_factor, 0)

    # Categories excluding rent
    non_rent_cats = [c for c in prepared if not ("rent" in c["name"].lower() and has_rent)]

    # Calculate target spending pool (leaving room for buffer, invest, savings, and at least 5-20% reserve)
    goals_total = rec_buffer + rec_investment + rec_savings
    ideal_reserve = round(available_income * reserve_target_percentage, 0)

    max_for_non_rent = max(0.0, variable_income_pool - goals_total - ideal_reserve)
    if max_for_non_rent < (variable_income_pool * 0.40):
        # Relax ideal reserve if tight
        max_for_non_rent = max(0.0, variable_income_pool - goals_total - (available_income * 0.05))

    # Normalize weights among non-rent categories
    total_weights = sum(c["base_weight"] for c in non_rent_cats) or 1.0

    allocations_map = {}
    if has_rent:
        allocations_map["rent"] = rent_allocation

    allocated_sum = rent_allocation
    for c in non_rent_cats:
        ratio = c["base_weight"] / total_weights
        val = round(max_for_non_rent * ratio, 0)
        # Minimum baseline 50 Rs for small amounts
        val = max(50.0, val) if max_for_non_rent > 200 else val
        allocations_map[c["name"]] = val
        allocated_sum += val

    # Verify constraint: Total planned with goals <= available income
    total_with_goals = allocated_sum + rec_buffer + rec_investment + rec_savings
    if total_with_goals > available_income:
        excess = total_with_goals - available_income
        # Reduce discretionary first
        for c in sorted(non_rent_cats, key=lambda x: -x["priority"]):
            if excess <= 0:
                break
            curr = allocations_map.get(c["name"], 0)
            reduction = min(curr - 50.0, excess)
            if reduction > 0:
                allocations_map[c["name"]] -= reduction
                excess -= reduction
                allocated_sum -= reduction

        if excess > 0:
            rec_savings = max(0.0, rec_savings - excess)
            excess = max(0.0, (allocated_sum + rec_buffer + rec_investment + rec_savings) - available_income)
        if excess > 0:
            rec_investment = max(0.0, rec_investment - excess)
            excess = max(0.0, (allocated_sum + rec_buffer + rec_investment + rec_savings) - available_income)
        if excess > 0:
            rec_buffer = max(0.0, rec_buffer - excess)
            excess = max(0.0, (allocated_sum + rec_buffer + rec_investment + rec_savings) - available_income)

    unallocated_reserve = max(0.0, available_income - (allocated_sum + rec_buffer + rec_investment + rec_savings))

    # Build allocations list
    allocations_result = []
    for c in prepared:
        if "rent" in c["name"].lower() and has_rent:
            assigned = rent_allocation
        else:
            assigned = allocations_map.get(c["name"], 0.0)

        allocations_result.append({
            "id": c["id"],
            "name": c["name"],
            "icon": c["icon"],
            "color": c["color"],
            "is_essential": c["is_essential"],
            "priority": c["priority"],
            "allocation_mode": c["allocation_mode"],
            "monthly_allocation": round(assigned, 0),
            "daily_limit": round(assigned / 30.0, 1)
        })

    warning = None
    shortfall = 0.0
    if allocated_sum + rec_buffer + rec_investment + rec_savings > available_income:
        shortfall = (allocated_sum + rec_buffer + rec_investment + rec_savings) - available_income
        warning = f"Planned budget exceeds available income by ₹{shortfall:,.0f}. Reduce one or more allocations to continue."
    elif (allocated_sum + rec_buffer + rec_investment + rec_savings) >= (available_income * 0.98):
        warning = "Essential expenses and targets consume almost all available income. Discretionary spending has been minimized."

    return {
        "monthly_income": monthly_income,
        "other_income": other_income,
        "existing_obligations": existing_obligations,
        "available_income": available_income,
        "total_allocated": round(allocated_sum, 0),
        "buffer_fund": round(rec_buffer, 0),
        "investment_target": round(rec_investment, 0),
        "savings_target": round(rec_savings, 0),
        "total_planned_with_goals": round(allocated_sum + rec_buffer + rec_investment + rec_savings, 0),
        "unallocated_reserve": round(unallocated_reserve, 0),
        "shortfall": round(shortfall, 0),
        "allocations": allocations_result,
        "warning": warning
    }



def get_month_date_range(month_str: str) -> tuple[datetime, datetime]:
    """Parse 'YYYY-MM' into start_date and end_date datetimes"""
    try:
        parts = month_str.split("-")
        y = int(parts[0])
        m = int(parts[1])
        start = datetime(y, m, 1)
        end = datetime(y + 1, 1, 1) if m == 12 else datetime(y, m + 1, 1)
        return start, end
    except Exception:
        today = date.today()
        start = datetime(today.year, today.month, 1)
        end = datetime(today.year + 1, 1, 1) if today.month == 12 else datetime(today.year, today.month + 1, 1)
        return start, end


def get_user_financial_profile(db: Session, user: models.User, month_str: Optional[str] = None) -> Dict[str, Any]:
    """
    Centralized Single Source of Truth for user's complete financial profile:
    - Income (salary + other incomes)
    - Budgeted allocations (essential vs discretionary)
    - Actual Expenses
    - Actual Investments
    - Actual Savings Transfers
    - Remaining Cash Flow = Actual Income - Actual Expenses - Actual Investments - Actual Savings
    - Budgeted vs Actual tracking
    """
    today = date.today()
    target_month_str = month_str or f"{today.year}-{today.month:02d}"
    start_date, end_date = get_month_date_range(target_month_str)

    # 1. Monthly Income (base salary from user record or active investment plan)
    plan = db.query(models.InvestmentPlan).filter(
        models.InvestmentPlan.user_id == user.id,
        models.InvestmentPlan.is_active == True
    ).first()

    base_salary = user.monthly_income if (user.monthly_income and user.monthly_income > 0) else (plan.monthly_salary if plan else 50000.0)

    # Explicit Income entries recorded for target month
    explicit_incomes = db.query(func.sum(models.Income.amount)).filter(
        models.Income.user_id == user.id,
        models.Income.date >= start_date,
        models.Income.date < end_date
    ).scalar() or 0.0

    total_actual_income = explicit_incomes if explicit_incomes > 0 else base_salary

    # 2. Actual Expenses recorded for target month
    actual_expenses = db.query(func.sum(models.Expense.amount)).filter(
        models.Expense.user_id == user.id,
        models.Expense.date >= start_date,
        models.Expense.date < end_date
    ).scalar() or 0.0

    # 3. Actual Investments recorded for target month
    actual_investments = db.query(func.sum(models.Investment.amount)).filter(
        models.Investment.user_id == user.id,
        models.Investment.date >= start_date,
        models.Investment.date < end_date
    ).scalar() or 0.0

    # 4. Actual Savings transferred/deposited for target month
    actual_savings = db.query(func.sum(models.SavingsTransaction.amount)).filter(
        models.SavingsTransaction.user_id == user.id,
        models.SavingsTransaction.date >= start_date,
        models.SavingsTransaction.date < end_date
    ).scalar() or 0.0

    # 5. Buffer usage for target month
    buffer_used = db.query(func.sum(models.BufferUsage.amount)).filter(
        models.BufferUsage.user_id == user.id,
        models.BufferUsage.date >= start_date,
        models.BufferUsage.date < end_date
    ).scalar() or 0.0

    buffer_fund = db.query(models.BufferFund).filter(models.BufferFund.user_id == user.id).first()
    monthly_buffer_limit = buffer_fund.monthly_buffer if buffer_fund else 3000.0

    # 6. Category breakdown & Budgeted allocations
    categories = db.query(models.Category).filter(models.Category.user_id == user.id).all()
    category_items = []
    total_budgeted_categories = 0.0

    for cat in categories:
        # Check for month-specific budget override
        b_entry = db.query(models.CategoryMonthlyBudget).filter(
            models.CategoryMonthlyBudget.user_id == user.id,
            models.CategoryMonthlyBudget.category_id == cat.id,
            models.CategoryMonthlyBudget.month_year == target_month_str
        ).first()

        effective_budget = b_entry.budget_amount if b_entry else cat.monthly_limit
        total_budgeted_categories += effective_budget

        spent = db.query(func.sum(models.Expense.amount)).filter(
            models.Expense.user_id == user.id,
            models.Expense.category_id == cat.id,
            models.Expense.date >= start_date,
            models.Expense.date < end_date
        ).scalar() or 0.0

        rem = effective_budget - spent
        exceeded = effective_budget > 0 and spent > effective_budget
        pct = (spent / effective_budget * 100.0) if effective_budget > 0 else 0.0

        # Daily spent for today
        today_date = date.today()
        daily_spent = 0.0
        if target_year == today_date.year and target_month == today_date.month:
            daily_spent = db.query(func.sum(models.Expense.amount)).filter(
                models.Expense.user_id == user.id,
                models.Expense.category_id == cat.id,
                func.date(models.Expense.date) == today_date
            ).scalar() or 0.0

        daily_rem = max(0.0, (cat.daily_limit or 0.0) - daily_spent) if (cat.daily_limit and cat.daily_limit > 0) else 0.0

        category_items.append({
            "id": cat.id,
            "name": cat.name,
            "icon": cat.icon,
            "color": cat.color,
            "frequency": cat.frequency if hasattr(cat, 'frequency') and cat.frequency else "monthly",
            "expected_frequency": cat.expected_frequency if hasattr(cat, 'expected_frequency') and cat.expected_frequency else "",
            "transaction_limit": cat.transaction_limit if hasattr(cat, 'transaction_limit') and cat.transaction_limit else 0.0,
            "is_essential": cat.is_essential if hasattr(cat, 'is_essential') and cat.is_essential is not None else True,
            "priority": cat.priority if hasattr(cat, 'priority') and cat.priority is not None else 1,
            "allocation_mode": (b_entry.allocation_mode if (b_entry and b_entry.allocation_mode) else (cat.allocation_mode or "auto")),
            "budgeted": effective_budget,
            "spent": spent,
            "remaining": rem,
            "percent_used": round(pct, 1),
            "is_exceeded": exceeded,
            "excess": max(0.0, spent - effective_budget),
            "daily_limit": cat.daily_limit or 0.0,
            "daily_spent": daily_spent,
            "daily_remaining": daily_rem,
            "daily_exceeded": (cat.daily_limit or 0.0) > 0 and daily_spent > cat.daily_limit
        })

    # 7. Remaining Cash Flow Equation (Actual activity based)
    # Remaining Cash = Actual Income - Actual Expenses - Actual Investments - Actual Savings
    remaining_cash = total_actual_income - actual_expenses - actual_investments - actual_savings

    # 8. Budget vs Income Constraints
    available_income = base_salary
    planned_total = total_budgeted_categories
    unallocated_reserve = max(0.0, available_income - planned_total)
    budget_shortfall = max(0.0, planned_total - available_income)
    is_budget_exceeded = planned_total > available_income

    return {
        "month_year": target_month_str,
        "user_id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "allocation_mode": user.allocation_mode or "auto",
        "monthly_income": base_salary,
        "available_income": available_income,
        "total_budgeted": planned_total,
        "unallocated_reserve": unallocated_reserve,
        "budget_shortfall": budget_shortfall,
        "is_budget_exceeded": is_budget_exceeded,
        "warning": f"Your planned budget exceeds your available income by ₹{budget_shortfall:,.0f}. Reduce one or more allocations to continue." if is_budget_exceeded else None,
        # Actual cash flow
        "actual_income": total_actual_income,
        "explicit_income": explicit_incomes,
        "actual_expenses": actual_expenses,
        "actual_investments": actual_investments,
        "actual_savings": actual_savings,
        "buffer_used": buffer_used,
        "monthly_buffer_limit": monthly_buffer_limit,
        "remaining_cash": remaining_cash,
        "positive_leftover": max(0.0, remaining_cash),
        # Target vs Actual breakdown
        "investment_target": plan.investment_target if plan else 0.0,
        "categories": category_items
    }
