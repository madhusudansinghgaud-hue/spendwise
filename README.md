# 💰 SpendWise — Intelligent Expense & Budget Management

> A modern, full-stack personal finance application that operates seamlessly as a **responsive desktop website** and a **standalone installable mobile app (PWA)** with zero-loss cloud persistence.

---

## 🌟 Key Features

### 1. Income-Based Budget Allocation Engine
- **Salary Setup**: Enter your monthly net income (e.g. ₹10,000, ₹50,000).
- **Core Rule**: Total planned allocations (categories + emergency buffer + investments + savings) never exceed your available monthly income.
- **Intelligent Distribution**: Prioritizes essential expenses (Rent, Groceries, Utilities) before discretionary categories (Entertainment, Shopping).

### 2. Daily & Occasional Expense Management
- **Daily Categories (Coffee, Snacks, Local Travel)**:
  - Configurable daily spending limit & monthly category budget.
  - Live counters for **Spent Today** and **Remaining Daily Allowance**.
  - **Automatic Midnight Reset**: Daily spending resets at calendar midnight without altering the monthly total.
- **Occasional / As-Needed (Clothing, Electronics, Medical)**:
  - Expected frequency tracking (e.g. "twice a month").
  - Optional per-transaction ceiling. Irregular spending intervals are never penalized as overspending.

### 3. Smart Spending Alerts & Pop-up Dialogs
- Pre-flight warning triggered before finalizing any expense that would exceed a daily allowance or monthly budget.
- Unified alert dialog presents 4 resolution options:
  1. **Transfer Budget**: Reallocate funds from a category with surplus budget.
  2. **Use Emergency Buffer**: Cover the excess directly from your dedicated Emergency Buffer.
  3. **Reduce Expense**: Edit the transaction amount inline.
  4. **Proceed**: Explicitly tag transaction as `⚠️ Over Budget` in history and analysis.
- **Cancel**: Aborts the transaction with zero database records created.

### 4. Zero-Sum Budget Reallocation
- Move money between categories or from the buffer without inflating total planned income or budget.
- Complete historical audit trail with source, destination, amount, reason, and timestamps.

### 5. Automated Bank & UPI SMS Sync
- **Webhook Integration**: Native endpoint (`/api/expenses/webhook`) connects to phone automation apps like **MacroDroid** or **Tasker** to auto-log Indian UPI and bank debit alerts in real-time.
- **In-App Paste Parser**: Paste raw SMS text into the app to instantly extract amount, merchant, and UPI reference.

### 6. Progressive Web App (PWA) & Mobile Installation
- **Desktop Website**: Full-screen dashboard, sidebar navigation, interactive charts, and deep monthly analysis reports.
- **Mobile Standalone App**: Install directly from Chrome or Safari to your phone's app drawer with standalone display, custom splash screen, and offline shell.

---

## 🏗️ Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────┐
│                   SpendWise Platform                   │
│                                                        │
│  ┌───────────────────────┐    ┌───────────────────────┐│
│  │   Frontend (React 19) │    │  Backend (FastAPI)    ││
│  │   • Vite & Tailwind   │◄──►│  • Python 3.11        ││
│  │   • Recharts & PWA    │    │  • SQLAlchemy 2.0     ││
│  └───────────────────────┘    └───────────┬───────────┘│
│                                           │            │
│                               ┌───────────▼───────────┐│
│                               │ Persistent Storage    ││
│                               │ • SQLite / PostgreSQL ││
│                               └───────────────────────┘│
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Running Locally

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Backend Setup
```bash
cd backend
python -m venv ../venv
..\venv\Scripts\activate          # On Windows (or 'source ../venv/bin/activate' on Linux/Mac)
pip install -r requirements.txt
uvicorn main:app --port 8000 --reload
```
- API Health: `http://localhost:8000/api/health`
- Interactive Swagger Docs: `http://localhost:8000/docs`

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
- Local URL: `http://localhost:5173/`
- Network URL: Accessible from other devices on the same Wi-Fi.

---

## ☁️ 1-Click Cloud Deployment (Render / Docker)

The repository includes a production multi-stage [`Dockerfile`](./Dockerfile) and [`render.yaml`](./render.yaml).

1. Fork or push this repository to GitHub.
2. Sign in to **[render.com](https://render.com)** $\rightarrow$ **New +** $\rightarrow$ **Blueprint**.
3. Select your `spendwise` repository and click **Apply**.
4. Render automatically compiles the React frontend into static assets, runs the FastAPI server, and attaches a **1 GB persistent disk** for your database.

---

## 🧪 Testing

The repository contains automated test suites covering all financial scenarios:

```bash
cd backend
python test_critical_fixes.py        # 17 Scenario Tests (Income, Quotas, Allocations)
python test_daily_reallocation.py    # Daily Limits, Midnight Reset, Smart Alerts
python test_scenarios.py             # End-to-end Cash Flow & Savings Settling
```

---

## 📄 License
MIT License. Free for personal and commercial use.

