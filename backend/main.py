import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from database import engine, Base, run_migrations
from routes import categories, expenses, dashboard, investments, buffer, auth, income, savings, analysis
import models

# Create database tables and migrate missing columns
Base.metadata.create_all(bind=engine)
run_migrations()


app = FastAPI(title="SpendWise API", version="2.0.0")

# CORS for React frontend & mobile LAN/Cloud access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all API routers
app.include_router(categories.router)
app.include_router(expenses.router)
app.include_router(dashboard.router)
app.include_router(investments.router)
app.include_router(buffer.router)
app.include_router(auth.router)
app.include_router(income.router)
app.include_router(savings.router)
app.include_router(analysis.router)


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "SpendWise API", "version": "2.0.0"}


# Serve static frontend in production / container deployment
# Checks multiple common build paths
dist_candidates = [
    os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"),
    os.path.join(os.path.dirname(__file__), "dist"),
    "/app/frontend/dist",
    "/app/dist"
]

frontend_dist_path = None
for candidate in dist_candidates:
    if os.path.exists(candidate) and os.path.isdir(candidate):
        frontend_dist_path = os.path.abspath(candidate)
        break

if frontend_dist_path:
    # Mount assets folder
    assets_path = os.path.join(frontend_dist_path, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

    # SPA catch-all fallback
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't hijack API routes
        if full_path.startswith("api/") or full_path == "docs" or full_path == "openapi.json":
            return {"detail": "Not Found"}
        file_path = os.path.join(frontend_dist_path, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist_path, "index.html"))
else:
    @app.get("/")
    def root():
        return {"message": "SpendWise API is running 🚀", "docs": "/docs"}


@app.on_event("startup")
def seed_default_data():
    """Seed default categories & buffer fund on first run"""
    from database import SessionLocal
    db = SessionLocal()
    try:
        count = db.query(models.Category).count()
        if count == 0:
            defaults = [
                {"name": "Groceries", "icon": "🛒", "color": "#10b981", "daily_limit": 500, "monthly_limit": 8000},
                {"name": "Food & Dining", "icon": "🍔", "color": "#ef4444", "daily_limit": 400, "monthly_limit": 7000},
                {"name": "Transport", "icon": "🚗", "color": "#3b82f6", "daily_limit": 300, "monthly_limit": 5000},
                {"name": "Shopping", "icon": "🛍️", "color": "#ec4899", "daily_limit": 300, "monthly_limit": 5000},
                {"name": "Beverages & Coffee", "icon": "☕", "color": "#8b5cf6", "daily_limit": 200, "monthly_limit": 4000},
                {"name": "Entertainment", "icon": "🎮", "color": "#f59e0b", "daily_limit": 200, "monthly_limit": 3000},
            ]
            for d in defaults:
                db.add(models.Category(**d))
            db.commit()

        # Seed Buffer Fund if not exists
        buf = db.query(models.BufferFund).first()
        if not buf:
            db.add(models.BufferFund(daily_buffer=150.0, monthly_buffer=3000.0))
            db.commit()

        # Seed default investment plan if not exists (Salary: 50,000, Investment: 10,000)
        inv = db.query(models.InvestmentPlan).first()
        if not inv:
            db.add(models.InvestmentPlan(
                name="Monthly Wealth Builder",
                monthly_salary=50000.0,
                investment_target=10000.0,
                investment_type="Mutual Funds SIP",
                notes="Target ₹10,000/month wealth accumulation",
                is_active=True
            ))
            db.commit()
    finally:
        db.close()
