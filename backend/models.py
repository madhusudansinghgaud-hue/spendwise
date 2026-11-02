from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, default=1)
    name = Column(String, index=True)
    icon = Column(String, default="💰")
    color = Column(String, default="#6366f1")
    daily_limit = Column(Float, default=0.0)
    monthly_limit = Column(Float, default=0.0)
    frequency = Column(String, default="monthly")  # "daily", "weekly", "monthly", "occasional"
    expected_frequency = Column(String, default="")  # e.g. "2 times a month", "as needed"
    transaction_limit = Column(Float, default=0.0)  # optional per-transaction limit for occasional
    is_essential = Column(Boolean, default=True)  # True = Essential, False = Discretionary
    priority = Column(Integer, default=1)  # 1=Essential, 2=Recurring, 3=Buffer, 4=Investment, 5=Savings, 6=Discretionary
    allocation_mode = Column(String, default="auto")  # "auto" or "manual"
    created_at = Column(DateTime, default=datetime.utcnow)

    expenses = relationship("Expense", back_populates="category")
    merchant_mappings = relationship("MerchantMapping", back_populates="category")



class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, default=1)
    amount = Column(Float, nullable=False)
    description = Column(String, default="")
    merchant = Column(String, default="")
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    source = Column(String, default="manual")  # manual, sms, csv
    upi_ref = Column(String, default="")
    notes = Column(Text, default="")
    is_over_budget = Column(Boolean, default=False)
    over_budget_type = Column(String, default="")  # "none", "daily", "monthly", "both", "transaction"
    reallocation_note = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    category = relationship("Category", back_populates="expenses")


class MerchantMapping(Base):
    __tablename__ = "merchant_mappings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, default=1)
    merchant_name = Column(String, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"))
    confidence = Column(Float, default=1.0)
    usage_count = Column(Integer, default=1)

    category = relationship("Category", back_populates="merchant_mappings")


class InvestmentPlan(Base):
    __tablename__ = "investment_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, default=1)
    name = Column(String, default="My Investment Plan")
    monthly_salary = Column(Float, default=0.0)
    investment_target = Column(Float, default=0.0)
    investment_type = Column(String, default="SIP")  # SIP, FD, stocks, etc.
    notes = Column(Text, default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, default=1)
    key = Column(String, index=True)
    value = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BufferFund(Base):
    __tablename__ = "buffer_funds"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, default=1)
    monthly_buffer = Column(Float, default=3000.0)
    daily_buffer = Column(Float, default=150.0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BufferUsage(Base):
    __tablename__ = "buffer_usages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, default=1)
    amount = Column(Float, nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    reason = Column(String, default="")
    date = Column(DateTime, default=datetime.utcnow)

    category = relationship("Category")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String, default="")
    display_name = Column(String, default="Hunter")
    avatar = Column(String, default="👨‍💻")
    role_title = Column(String, default="Smart Budgeter")
    theme = Column(String, default="dark")  # "dark" or "light"
    monthly_income = Column(Float, default=50000.0)
    allocation_mode = Column(String, default="auto")  # "auto" or "manual"
    created_at = Column(DateTime, default=datetime.utcnow)


class Income(Base):
    __tablename__ = "incomes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    amount = Column(Float, nullable=False)
    source = Column(String, default="Salary")  # Salary, Freelance, Business, Investment, Bonus, Other
    description = Column(String, default="")
    date = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


class Investment(Base):
    __tablename__ = "investments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    amount = Column(Float, nullable=False)
    name = Column(String, nullable=False)
    category = Column(String, default="Mutual Funds SIP")  # Mutual Funds SIP, Stocks, FD, PPF, Gold, Crypto, Other
    date = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class CategoryMonthlyBudget(Base):
    __tablename__ = "category_monthly_budgets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    month_year = Column(String, index=True, nullable=False)  # "YYYY-MM", e.g. "2026-10"
    budget_amount = Column(Float, nullable=False)
    allocation_mode = Column(String, default="auto")  # "auto" or "manual"
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("Category")



class MonthlySavingsRecord(Base):
    __tablename__ = "monthly_savings_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    month_year = Column(String, index=True, nullable=False)  # "YYYY-MM"
    income = Column(Float, default=0.0)
    expenses = Column(Float, default=0.0)
    investments = Column(Float, default=0.0)
    remaining_amount = Column(Float, default=0.0)
    savings_added = Column(Float, default=0.0)
    is_settled = Column(Boolean, default=True)
    settled_at = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class SavingsTransaction(Base):
    __tablename__ = "savings_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    amount = Column(Float, nullable=False)
    source = Column(String, default="auto_leftover")  # auto_leftover, manual_deposit, emergency_buffer
    month_year = Column(String, default="")  # e.g. "2026-10"
    title = Column(String, default="Month-End Leftover Savings")
    date = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


class BudgetReallocation(Base):
    __tablename__ = "budget_reallocations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    month_year = Column(String, index=True, nullable=False)  # "YYYY-MM"
    source_type = Column(String, default="category")  # "category" or "buffer"
    source_category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    destination_type = Column(String, default="category")  # "category" or "buffer"
    destination_category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    amount = Column(Float, nullable=False)
    reason = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    source_category = relationship("Category", foreign_keys=[source_category_id])
    destination_category = relationship("Category", foreign_keys=[destination_category_id])



