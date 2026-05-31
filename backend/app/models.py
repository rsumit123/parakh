from datetime import datetime, timezone
from sqlalchemy import String, Integer, JSON, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Product(Base):
    __tablename__ = "products"
    barcode: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="")
    brand: Mapped[str] = mapped_column(String, default="")
    ingredients: Mapped[list] = mapped_column(JSON, default=list)
    nutrition: Mapped[dict] = mapped_column(JSON, default=dict)
    score_overall: Mapped[int] = mapped_column(Integer, default=0)
    score_grade: Mapped[str] = mapped_column(String, default="E")
    score_breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String, default="db")  # db|off|photo
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String, unique=True)
    auth_provider: Mapped[str] = mapped_column(String, default="email")
    tier: Mapped[str] = mapped_column(String, default="free")  # guest|free|paid
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class DailyScan(Base):
    __tablename__ = "daily_scans"
    __table_args__ = (UniqueConstraint("identity", "day", name="uq_identity_day"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    identity: Mapped[str] = mapped_column(String, index=True)
    day: Mapped[str] = mapped_column(String)  # ISO date "YYYY-MM-DD"
    count: Mapped[int] = mapped_column(Integer, default=0)
