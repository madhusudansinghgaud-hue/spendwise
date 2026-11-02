# 🌐 SpendWise — Cloud Deployment & Persistence Guide

## 1. Why The Application Went Down When the PC Was Turned Off

Previously, the application ran as **three temporary localhost processes inside Windows RAM**:

1. `uvicorn main:app --port 8000` — FastAPI backend on your PC
2. `npm run dev --host 0.0.0.0` — Vite dev server on port 5173
3. `cloudflared tunnel` — Temporary Cloudflare tunnel proxying to localhost

**When your PC was shut down:**
- Windows killed the Python & Node.js processes
- The Cloudflare tunnel was severed → Error 1033 for external users
- The SQLite database lived only on your local hard drive
- Zero persistence, zero availability

---

## 2. Permanent Production Architecture

The fix packages everything into a **single Docker container** deployed to a cloud host:

```
┌─────────────────────────────────────────────┐
│          Docker Container (Cloud)           │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  FastAPI (Uvicorn) — port 8000      │   │
│  │  ├── /api/* → Python business logic │   │
│  │  └── /* → React SPA (static files) │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  Persistent Volume: /app/data/      │   │
│  │  └── spendwise.db (SQLite)          │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
          ↕  HTTPS (always-on)
    Your phone / browser / PC
```

**Key properties:**
- ✅ Available 24/7 — even when your PC is off
- ✅ Database on a persistent cloud volume — never lost on restart
- ✅ Auto-restart if the process crashes (cloud host policy)
- ✅ HTTPS with a permanent URL
- ✅ PWA installable on your phone from the permanent URL

---

## 3. One-Click Deployment on Render (Free Tier)

### Step 1 — Push your code to GitHub
```bash
git init
git add .
git commit -m "SpendWise v2.0 Production"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/spendwise.git
git push -u origin main
```

### Step 2 — Deploy on Render
1. Go to [render.com](https://render.com) → sign in with GitHub
2. Click **New +** → **Blueprint**
3. Select your `spendwise` repo
4. Render reads `render.yaml` automatically and creates:
   - A **Web Service** running the Docker container
   - A **1 GB persistent disk** at `/app/data` for the SQLite database
   - A `/api/health` healthcheck
5. Click **Apply**
6. Within 3–5 minutes, Render gives you a permanent link:

   ```
   https://spendwise-xxxx.onrender.com
   ```

> **This URL never changes, never expires, and works even when your PC is off.**

### Environment Variables (set in Render dashboard or render.yaml)
| Variable        | Value                                | Purpose                     |
|-----------------|--------------------------------------|-----------------------------|
| `PORT`          | `8000`                               | Uvicorn listening port      |
| `ENVIRONMENT`   | `production`                         | App mode flag               |
| `DATABASE_URL`  | `sqlite:////app/data/spendwise.db`   | Points DB to the disk volume |

> To use PostgreSQL instead of SQLite (recommended for team use):
> - Create a free Postgres on [Supabase](https://supabase.com) or [Neon](https://neon.tech)
> - Set `DATABASE_URL=postgresql://user:pass@host/dbname` in Render's environment tab
> - No other code changes needed — SQLAlchemy handles both

---

## 4. Alternative: Railway.app

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
2. Railway auto-detects the `Dockerfile`
3. Under **Settings → Volumes**, mount a volume at `/app/data`
4. Set env var `DATABASE_URL=sqlite:////app/data/spendwise.db`

---

## 5. Alternative: Fly.io

```bash
# Install flyctl, then:
fly launch --name spendwise --region sin
fly volumes create spendwise_data --size 1 --region sin
fly secrets set DATABASE_URL=sqlite:////app/data/spendwise.db
fly deploy
```

---

## 6. Running Locally (Development Mode)

### Backend
```bash
cd backend
..\venv\Scripts\python.exe -m uvicorn main:app --port 8000 --host 0.0.0.0 --reload
```
- API: `http://localhost:8000`
- Swagger docs: `http://localhost:8000/docs`

### Frontend
```bash
cd frontend
npm install          # first time only
npm run dev -- --host 0.0.0.0
```
- Local URL: `http://localhost:5173`
- LAN Wi-Fi URL: `http://192.168.x.x:5173`

> The frontend Vite dev server automatically proxies `/api/*` to `localhost:8000` via `vite.config.js`.

---

## 7. Data Persistence Details

| Data Type              | Where Stored                  | Persistent? |
|------------------------|-------------------------------|-------------|
| Income records         | `incomes` table in SQLite     | ✅ Yes       |
| Expense records        | `expenses` table in SQLite    | ✅ Yes       |
| Categories & budgets   | `categories` + `category_monthly_budgets` | ✅ Yes |
| Investment entries     | `investments` table           | ✅ Yes       |
| Savings transactions   | `savings_transactions` table  | ✅ Yes       |
| Monthly settlements    | `monthly_savings_records`     | ✅ Yes       |
| User profiles          | `users` + `user_settings`     | ✅ Yes       |
| Buffer fund settings   | `buffer_funds`                | ✅ Yes       |

All data lives in `/app/data/spendwise.db` on the **cloud persistent disk**.  
Restarting the container never deletes this file.

---

## 8. Auto-Restart & Crash Recovery

- **Render**: Auto-restarts crashed processes. If the container exits with a non-zero code, it relaunches automatically.
- **HEALTHCHECK** in `Dockerfile`: Every 30 seconds, `curl http://localhost:8000/api/health` is called. If it fails 3 times consecutively, the container is marked unhealthy and restarted.

---

## 9. Monthly Business Logic Summary

| Rule | Implementation |
|------|----------------|
| Income − Expenses − Investments = Remaining | `calculate_month_financials()` in `savings.py` |
| Positive leftover → auto-save | `/api/savings/settle-month` endpoint |
| No double-counting same month | `MonthlySavingsRecord.is_settled` flag checked before writing |
| Budget override per month | `CategoryMonthlyBudget` table per `YYYY-MM` |
| Previous months immutable | All data stored with date; historical queries use date range filters |
| Investments separate from expenses | `investments` vs `expenses` — separate tables, separate API routes |
| Savings separate from investments | `savings_transactions` vs `investments` — completely different tables |
