from datetime import datetime, timezone
from sqlalchemy import String, Integer, JSON, DateTime, UniqueConstraint, Float, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Product(Base):
    __tablename__ = "products"
    barcode: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="")
    brand: Mapped[str] = mapped_column(String, default="")
    category: Mapped[str] = mapped_column(String, default="", index=True)  # for "similar products"
    ingredients: Mapped[list] = mapped_column(JSON, default=list)
    nutrition: Mapped[dict] = mapped_column(JSON, default=dict)
    score_overall: Mapped[int] = mapped_column(Integer, default=0)   # denormalized for queries
    score_grade: Mapped[str] = mapped_column(String, default="E")    # denormalized for queries
    score_json: Mapped[dict] = mapped_column(JSON, default=dict)     # full scorer output
    source: Mapped[str] = mapped_column(String, default="db")  # db|off|photo|amazon
    image_url: Mapped[str] = mapped_column(String, default="")  # front/display image
    embedding: Mapped[list] = mapped_column(JSON, default=list)  # vector for similar-product search
    serving_size_g: Mapped[float | None] = mapped_column(Float, nullable=True)  # for portion default
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String, unique=True)
    auth_provider: Mapped[str] = mapped_column(String, default="email")
    tier: Mapped[str] = mapped_column(String, default="free")  # guest|free|paid
    google_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class DailyScan(Base):
    __tablename__ = "daily_scans"
    __table_args__ = (UniqueConstraint("identity", "day", name="uq_identity_day"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    identity: Mapped[str] = mapped_column(String, index=True)
    day: Mapped[str] = mapped_column(String)  # ISO date "YYYY-MM-DD"
    count: Mapped[int] = mapped_column(Integer, default=0)


class FoodLogEntry(Base):
    """One logged food for one day. Immutable record: macros are a frozen snapshot
    (per-100g x quantity_g / 100), so editing a product never changes past days."""
    __tablename__ = "food_log"
    __table_args__ = (Index("ix_food_log_identity_day", "identity", "day"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    identity: Mapped[str] = mapped_column(String)   # 'user:<n>'
    day: Mapped[str] = mapped_column(String)        # local 'YYYY-MM-DD'
    kind: Mapped[str] = mapped_column(String, default="packaged")  # packaged|unpackaged|manual
    barcode: Mapped[str | None] = mapped_column(String, nullable=True)
    name: Mapped[str] = mapped_column(String, default="")
    brand: Mapped[str] = mapped_column(String, default="")
    quantity_g: Mapped[float] = mapped_column(Float, default=0.0)
    energy_kj: Mapped[float] = mapped_column(Float, default=0.0)
    sugars_g: Mapped[float] = mapped_column(Float, default=0.0)
    sat_fat_g: Mapped[float] = mapped_column(Float, default=0.0)
    salt_g: Mapped[float] = mapped_column(Float, default=0.0)
    fibre_g: Mapped[float] = mapped_column(Float, default=0.0)
    protein_g: Mapped[float] = mapped_column(Float, default=0.0)
    image_url: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Profile(Base):
    """Optional per-user profile + explicit target overrides. Absence = smart defaults."""
    __tablename__ = "profiles"
    identity: Mapped[str] = mapped_column(String, primary_key=True)
    sex: Mapped[str | None] = mapped_column(String, nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    activity: Mapped[str | None] = mapped_column(String, nullable=True)
    goal: Mapped[str | None] = mapped_column(String, nullable=True)
    target_overrides: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
