# ─── Stage 1: Build Frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ─── Stage 2: Production Python Backend + Compiled Frontend ───────────────────
FROM python:3.11-slim AS production
WORKDIR /app

# Reduce image noise & ensure unbuffered logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV ENVIRONMENT=production

# Install system deps (for any C-extension wheels)
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install backend Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY backend/ ./backend/

# Copy compiled React frontend (served by FastAPI as static SPA)
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create the persistent data directory (mounted as a cloud volume on Render/Railway/Fly.io)
RUN mkdir -p /app/data

# Default DB path: persisted volume at /app/data/spendwise.db
# Override via DATABASE_URL env var for PostgreSQL (e.g. Supabase, Neon, Render Postgres)
ENV DATABASE_URL="sqlite:////app/data/spendwise.db"

EXPOSE 8000

# Healthcheck — FastAPI /api/health responds with {"status":"healthy"}
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

# Start Uvicorn — honours $PORT for cloud hosts that inject their own port
WORKDIR /app/backend
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
