import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./spendwise.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True
    )


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def run_migrations():
    """Ensure any columns in SQLAlchemy models exist in SQLite database"""
    import sqlite3
    import models

    db_path = DATABASE_URL.replace("sqlite:///", "")
    if not os.path.exists(db_path):
        return

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        type_map = {
            "INTEGER": "INTEGER",
            "FLOAT": "FLOAT",
            "VARCHAR": "TEXT",
            "TEXT": "TEXT",
            "DATETIME": "TIMESTAMP",
            "BOOLEAN": "BOOLEAN"
        }

        for table_name, table in models.Base.metadata.tables.items():
            # Check if table exists
            table_check = cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,)
            ).fetchone()
            if not table_check:
                continue

            existing_cols = {col[1] for col in cursor.execute(f"PRAGMA table_info({table_name})").fetchall()}
            for col in table.columns:
                if col.name not in existing_cols:
                    col_type_str = str(col.type).upper()
                    matched_type = "TEXT"
                    for k, v in type_map.items():
                        if k in col_type_str:
                            matched_type = v
                            break
                    default_clause = ""
                    if col.default is not None and hasattr(col.default, 'arg'):
                        val = col.default.arg
                        if isinstance(val, bool):
                            default_clause = f" DEFAULT {1 if val else 0}"
                        elif isinstance(val, (int, float)):
                            default_clause = f" DEFAULT {val}"
                        elif isinstance(val, str):
                            default_clause = f" DEFAULT '{val}'"

                    alter_stmt = f"ALTER TABLE {table_name} ADD COLUMN {col.name} {matched_type}{default_clause}"
                    print(f"[MIGRATION] Executing: {alter_stmt}")
                    cursor.execute(alter_stmt)

        # Fix merchant_mappings: replace global unique on merchant_name
        # with per-user unique on (user_id, merchant_name) so multiple users
        # can share the same merchant name without a UNIQUE constraint violation.
        try:
            cursor.execute("DROP INDEX IF EXISTS ix_merchant_mappings_merchant_name")
            cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_merchant_mappings_user_merchant "
                "ON merchant_mappings (user_id, merchant_name)"
            )
        except Exception as idx_err:
            print(f"[MIGRATION WARNING] merchant_mappings index update: {idx_err}")

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[MIGRATION WARNING] Migration check: {e}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
