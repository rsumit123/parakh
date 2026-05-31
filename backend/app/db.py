from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    pass


# Columns added after the first release that must be back-filled onto existing tables,
# since create_all() only creates missing TABLES, not missing COLUMNS. Each entry is a
# plain SQLite-compatible ADD COLUMN clause; applied only if the column is absent.
_ADDED_COLUMNS: dict[str, dict[str, str]] = {
    "products": {"category": "VARCHAR DEFAULT ''"},
}


def _apply_lightweight_migrations(engine) -> None:
    """Idempotently add known new columns to pre-existing tables (SQLite ALTER ADD)."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    for table, columns in _ADDED_COLUMNS.items():
        if table not in existing_tables:
            continue  # create_all will have made it with all columns
        present = {c["name"] for c in inspector.get_columns(table)}
        for col, ddl in columns.items():
            if col not in present:
                with engine.begin() as conn:
                    conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN {col} {ddl}'))


def make_engine(url: str):
    if url in ("sqlite://", "sqlite:///:memory:"):
        return create_engine(
            url, connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    return create_engine(url, connect_args={"check_same_thread": False})


def make_session_factory(engine):
    return sessionmaker(bind=engine, expire_on_commit=False)


def init_db(engine):
    from app import models  # noqa: F401  ensure models are registered
    Base.metadata.create_all(engine)
    _apply_lightweight_migrations(engine)
