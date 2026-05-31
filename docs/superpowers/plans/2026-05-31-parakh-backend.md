# NutriScan Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the NutriScan FastAPI backend — a barcode/label scan pipeline that returns a single 0–100 health score (Nutri-Score + India penalties), backed by SQLite, with guest/free rate-limiting.

**Architecture:** A long-running FastAPI server. A scan request flows through: auth + rate-limit → our SQLite product cache → OpenFoodFacts fallback → label-photo vision extraction (via OpenRouter). Scoring is a pure, deterministic function. Every newly-resolved product is written back to SQLite so future scans are instant lookups.

**Tech Stack:** Python 3.11+, FastAPI, Uvicorn, SQLAlchemy 2.x + SQLite, httpx, pytest. Vision via OpenRouter (model configured by env var).

---

## File Structure

```
backend/
  app/
    __init__.py
    config.py            # env-driven settings (limits, model name, API keys)
    db.py                # SQLAlchemy engine/session, init_db()
    models.py            # ORM: Product, User, DailyScan
    schemas.py           # Pydantic request/response models
    scoring/
      __init__.py
      nutriscore.py      # pure Nutri-Score core (points → nutri value)
      scorer.py          # nutri → 0-100, India penalties, final grade + breakdown
    repositories/
      __init__.py
      products.py        # ProductRepository (get/save by barcode)
    clients/
      __init__.py
      openfoodfacts.py   # OpenFoodFactsClient.fetch(barcode)
      label_extractor.py # LabelExtractor.extract(image_bytes) via OpenRouter
    services/
      __init__.py
      rate_limiter.py    # check_and_consume(identity, tier)
      auth.py            # guest identity + email login + token validation
      scan.py            # ScanService orchestrating the pipeline
    main.py              # FastAPI app, routes, dependency wiring
  tests/
    test_nutriscore.py
    test_scorer.py
    test_products_repo.py
    test_openfoodfacts.py
    test_label_extractor.py
    test_rate_limiter.py
    test_auth.py
    test_scan_service.py
    test_api.py
  pyproject.toml
  .env.example
```

Each file has one responsibility. The two pure-logic units (`nutriscore.py`, `scorer.py`) carry the most tests because the score is the product's credibility.

---

## Shared Types (defined once, referenced throughout)

These shapes are used across tasks. Defined concretely in the tasks noted.

- **Nutrition dict** (per 100g), used by scorer/extractor/OFF client:
  ```python
  {"energy_kj": float, "sugars_g": float, "sat_fat_g": float,
   "salt_g": float, "fibre_g": float, "protein_g": float,
   "fruit_veg_nuts_pct": float}  # fruit_veg_nuts_pct defaults to 0.0
  ```
- **Ingredients**: `list[str]` of lowercased ingredient names.
- **Score result** (returned by `scorer.score`), defined in Task 4:
  ```python
  {"overall": int, "grade": str, "verdict": str,
   "positives": list[str], "negatives": list[str],
   "breakdown": {"nutrients": list[dict], "india_flags": list[dict]}}
  ```

---

### Task 1: Backend scaffold and tooling

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_config.py`

- [ ] **Step 1: Create `backend/pyproject.toml`**

```toml
[project]
name = "nutriscan-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.110",
  "uvicorn[standard]>=0.29",
  "sqlalchemy>=2.0",
  "httpx>=0.27",
  "pydantic>=2.6",
  "pydantic-settings>=2.2",
  "python-multipart>=0.0.9",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "pytest-asyncio>=0.23", "respx>=0.21"]

[tool.pytest.ini_options]
pythonpath = ["."]
asyncio_mode = "auto"
```

- [ ] **Step 2: Create `backend/.env.example`**

```bash
NUTRISCAN_GUEST_DAILY_LIMIT=3
NUTRISCAN_FREE_DAILY_LIMIT=10
NUTRISCAN_DB_URL=sqlite:///./nutriscan.db
NUTRISCAN_OPENROUTER_API_KEY=sk-or-changeme
NUTRISCAN_VISION_MODEL=google/gemini-flash-1.5
NUTRISCAN_OPENROUTER_URL=https://openrouter.ai/api/v1/chat/completions
```

- [ ] **Step 3: Create empty `backend/app/__init__.py` and `backend/tests/__init__.py`**

Both files are empty.

- [ ] **Step 4: Write the failing test** in `backend/tests/test_config.py`

```python
from app.config import Settings

def test_defaults_apply_when_env_absent():
    s = Settings(_env_file=None)
    assert s.guest_daily_limit == 3
    assert s.free_daily_limit == 10
    assert s.vision_model  # non-empty default

def test_env_overrides(monkeypatch):
    monkeypatch.setenv("NUTRISCAN_GUEST_DAILY_LIMIT", "5")
    s = Settings(_env_file=None)
    assert s.guest_daily_limit == 5
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd backend && pip install -e ".[dev]" && pytest tests/test_config.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.config'`

- [ ] **Step 6: Write `backend/app/config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="NUTRISCAN_", env_file=".env")

    guest_daily_limit: int = 3
    free_daily_limit: int = 10
    db_url: str = "sqlite:///./nutriscan.db"
    openrouter_api_key: str = "changeme"
    vision_model: str = "google/gemini-flash-1.5"
    openrouter_url: str = "https://openrouter.ai/api/v1/chat/completions"


def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && pytest tests/test_config.py -v`
Expected: PASS (2 passed)

- [ ] **Step 8: Commit**

```bash
git add backend/pyproject.toml backend/.env.example backend/app backend/tests
git commit -m "feat: backend scaffold and env-driven settings"
```

---

### Task 2: Database engine and ORM models

**Files:**
- Create: `backend/app/db.py`
- Create: `backend/app/models.py`
- Create: `backend/tests/test_db.py`

- [ ] **Step 1: Write the failing test** in `backend/tests/test_db.py`

```python
from sqlalchemy import select
from app.db import make_engine, make_session_factory, init_db
from app.models import Product, User, DailyScan


def test_can_create_tables_and_roundtrip_product():
    engine = make_engine("sqlite://")  # in-memory
    init_db(engine)
    Session = make_session_factory(engine)
    with Session() as s:
        s.add(Product(barcode="123", name="Test", brand="B",
                      ingredients=["a"], nutrition={"sugars_g": 1.0},
                      score_overall=80, score_grade="A",
                      score_breakdown={}, source="db"))
        s.commit()
    with Session() as s:
        p = s.scalar(select(Product).where(Product.barcode == "123"))
        assert p.name == "Test"
        assert p.ingredients == ["a"]
        assert p.nutrition["sugars_g"] == 1.0


def test_user_and_dailyscan_tables_exist():
    engine = make_engine("sqlite://")
    init_db(engine)
    Session = make_session_factory(engine)
    with Session() as s:
        s.add(User(email="x@y.com", auth_provider="email", tier="free"))
        s.add(DailyScan(identity="guest:abc", day="2026-05-31", count=2))
        s.commit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_db.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.db'`

- [ ] **Step 3: Write `backend/app/db.py`**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    pass


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
```

- [ ] **Step 4: Write `backend/app/models.py`**

```python
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_db.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/app/db.py backend/app/models.py backend/tests/test_db.py
git commit -m "feat: SQLite engine and ORM models (Product, User, DailyScan)"
```

---

### Task 3: Nutri-Score core (pure function)

**Files:**
- Create: `backend/app/scoring/__init__.py` (empty)
- Create: `backend/app/scoring/nutriscore.py`
- Create: `backend/tests/test_nutriscore.py`

- [ ] **Step 1: Create empty `backend/app/scoring/__init__.py`**

- [ ] **Step 2: Write the failing test** in `backend/tests/test_nutriscore.py`

```python
from app.scoring.nutriscore import nutri_value

LOW = {"energy_kj": 300, "sugars_g": 2, "sat_fat_g": 0.5, "salt_g": 0.1,
       "fibre_g": 5, "protein_g": 9, "fruit_veg_nuts_pct": 0}
HIGH = {"energy_kj": 2200, "sugars_g": 40, "sat_fat_g": 12, "salt_g": 1.5,
        "fibre_g": 0.5, "protein_g": 1, "fruit_veg_nuts_pct": 0}

def test_healthy_food_has_low_nutri_value():
    assert nutri_value(LOW) <= 0

def test_junk_food_has_high_nutri_value():
    assert nutri_value(HIGH) >= 11

def test_protein_excluded_when_negatives_high_and_no_fruit():
    # high negatives, decent protein but should not rescue the score
    food = dict(HIGH); food["protein_g"] = 9
    assert nutri_value(food) >= 11

def test_missing_keys_default_to_zero():
    assert isinstance(nutri_value({}), int)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest tests/test_nutriscore.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.scoring.nutriscore'`

- [ ] **Step 4: Write `backend/app/scoring/nutriscore.py`**

```python
"""Pure implementation of the 2017 Nutri-Score points model for general foods.
Input is a per-100g nutrition dict; output is the integer nutri value
(lower = healthier), used as the backbone score before India penalties."""


def _points(value: float, thresholds: list[float]) -> int:
    """Return the index (0..len) of the first threshold `value` does NOT exceed."""
    for i, t in enumerate(thresholds):
        if value <= t:
            return i
    return len(thresholds)


_ENERGY = [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350]
_SUGAR = [4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45]
_SATFAT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
_SODIUM = [90, 180, 270, 360, 450, 540, 630, 720, 810, 900]  # mg
_FIBRE = [0.9, 1.9, 2.8, 3.7, 4.7]
_PROTEIN = [1.6, 3.2, 4.8, 6.4, 8.0]
_FRUIT = [40, 60, 80]  # percent; >80 -> 5 (handled below)


def nutri_value(nutrition: dict) -> int:
    g = lambda k: float(nutrition.get(k, 0) or 0)
    sodium_mg = g("salt_g") * 400.0  # salt_g -> sodium mg (salt = sodium*2.5)

    negative = (
        _points(g("energy_kj"), _ENERGY)
        + _points(g("sugars_g"), _SUGAR)
        + _points(g("sat_fat_g"), _SATFAT)
        + _points(sodium_mg, _SODIUM)
    )

    fibre_pts = _points(g("fibre_g"), _FIBRE)
    protein_pts = _points(g("protein_g"), _PROTEIN)
    fruit_pct = g("fruit_veg_nuts_pct")
    fruit_pts = 5 if fruit_pct > 80 else _points(fruit_pct, _FRUIT)

    # Standard rule: if negatives >= 11 and fruit points < 5, protein is excluded.
    if negative >= 11 and fruit_pts < 5:
        positive = fibre_pts + fruit_pts
    else:
        positive = fibre_pts + fruit_pts + protein_pts

    return negative - positive
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_nutriscore.py -v`
Expected: PASS (4 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/app/scoring/__init__.py backend/app/scoring/nutriscore.py backend/tests/test_nutriscore.py
git commit -m "feat: pure Nutri-Score core points model"
```

---

### Task 4: Scorer — 0-100 scale, India penalties, final grade + breakdown

**Files:**
- Create: `backend/app/scoring/scorer.py`
- Create: `backend/tests/test_scorer.py`

- [ ] **Step 1: Write the failing test** in `backend/tests/test_scorer.py`

```python
from app.scoring.scorer import score, grade_from_score

HEALTHY = {"energy_kj": 300, "sugars_g": 2, "sat_fat_g": 0.5, "salt_g": 0.1,
           "fibre_g": 5, "protein_g": 9, "fruit_veg_nuts_pct": 0}
JUNK = {"energy_kj": 2200, "sugars_g": 40, "sat_fat_g": 12, "salt_g": 1.5,
        "fibre_g": 0.5, "protein_g": 1, "fruit_veg_nuts_pct": 0}

def test_grade_bands():
    assert grade_from_score(90) == "A"
    assert grade_from_score(65) == "B"
    assert grade_from_score(45) == "C"
    assert grade_from_score(25) == "D"
    assert grade_from_score(10) == "E"

def test_healthy_scores_high():
    r = score(["roasted chana"], HEALTHY)
    assert r["overall"] >= 80
    assert r["grade"] == "A"
    assert r["verdict"] == "Good choice"

def test_junk_scores_low():
    r = score(["sugar", "maida", "palm oil"], JUNK)
    assert r["overall"] <= 25
    assert r["grade"] in ("D", "E")

def test_palm_oil_penalty_applied_and_flagged():
    base = score(["wheat flour"], HEALTHY)["overall"]
    penalized = score(["palm oil"], HEALTHY)
    assert penalized["overall"] < base
    assert any("palm" in f["label"].lower() for f in penalized["breakdown"]["india_flags"])

def test_maida_flagged():
    r = score(["maida"], HEALTHY)
    assert any("refined" in f["label"].lower() for f in r["breakdown"]["india_flags"])

def test_breakdown_contains_nutrient_bars():
    r = score(["x"], HEALTHY)
    keys = {n["key"] for n in r["breakdown"]["nutrients"]}
    assert {"sugars", "sat_fat", "salt", "fibre", "protein"} <= keys

def test_overall_clamped_0_100():
    r = score(["palm oil", "maida"], JUNK)
    assert 0 <= r["overall"] <= 100
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_scorer.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.scoring.scorer'`

- [ ] **Step 3: Write `backend/app/scoring/scorer.py`**

```python
"""Turns nutrition + ingredients into the final user-facing score:
Nutri-Score backbone -> 0-100, minus India-specific penalties, -> grade + breakdown.
Deterministic: same input always yields the same output."""
from app.scoring.nutriscore import nutri_value

# Nutri value ranges roughly -15 (best) .. 40 (worst). Map linearly to 0-100.
_NUTRI_BEST = -15
_NUTRI_WORST = 40

# India-specific ingredient penalties: (substring match, points, flag label, note)
_INDIA_PENALTIES = [
    ("palm oil", 10, "Palm oil", "Flagged for India market"),
    ("palmolein", 10, "Palm oil", "Listed as palmolein"),
    ("maida", 8, "Refined flour (maida)", "Refined wheat flour, low fibre"),
    ("refined wheat flour", 8, "Refined flour (maida)", "Refined wheat flour, low fibre"),
]
# Additive markers each add a smaller penalty (capped).
_ADDITIVE_MARKERS = ["flavour enhancer", "flavor enhancer", "e621", "e635",
                     "monosodium glutamate", "msg", "artificial colour", "artificial color"]
_ADDITIVE_POINTS = 3
_ADDITIVE_CAP = 9


def grade_from_score(overall: int) -> str:
    if overall >= 80:
        return "A"
    if overall >= 60:
        return "B"
    if overall >= 40:
        return "C"
    if overall >= 20:
        return "D"
    return "E"


_VERDICTS = {
    "A": "Good choice", "B": "Good choice", "C": "Okay sometimes",
    "D": "Best limited", "E": "Best avoided",
}

# Nutrient bar config: (key, label, nutrition_key, high_is_bad, scale_max)
_BARS = [
    ("sugars", "Sugar", "sugars_g", True, 45),
    ("sat_fat", "Saturated fat", "sat_fat_g", True, 15),
    ("salt", "Salt", "salt_g", True, 3),
    ("fibre", "Fibre", "fibre_g", False, 8),
    ("protein", "Protein", "protein_g", False, 12),
]


def _base_0_100(nutrition: dict) -> int:
    nv = nutri_value(nutrition)
    nv = max(_NUTRI_BEST, min(_NUTRI_WORST, nv))
    span = _NUTRI_WORST - _NUTRI_BEST
    return round((_NUTRI_WORST - nv) / span * 100)


def _india_flags(ingredients: list[str]) -> tuple[int, list[dict]]:
    text = " ".join(i.lower() for i in ingredients)
    penalty = 0
    flags: list[dict] = []
    seen_labels: set[str] = set()
    for needle, pts, label, note in _INDIA_PENALTIES:
        if needle in text and label not in seen_labels:
            penalty += pts
            seen_labels.add(label)
            flags.append({"label": label, "note": note})
    additive_penalty = 0
    for marker in _ADDITIVE_MARKERS:
        if marker in text:
            additive_penalty = min(_ADDITIVE_CAP, additive_penalty + _ADDITIVE_POINTS)
    if additive_penalty:
        penalty += additive_penalty
        flags.append({"label": "Additives", "note": "Flavour enhancers / artificial additives"})
    return penalty, flags


def _nutrient_bars(nutrition: dict) -> list[dict]:
    g = lambda k: float(nutrition.get(k, 0) or 0)
    bars = []
    for key, label, nkey, high_is_bad, scale_max in _BARS:
        value = g(nkey)
        pct = max(0, min(100, round(value / scale_max * 100)))
        if high_is_bad:
            level = "high" if pct >= 60 else "ok" if pct >= 30 else "low"
        else:
            level = "high" if pct >= 50 else "ok" if pct >= 25 else "low"
        bars.append({"key": key, "label": label, "value_g": value,
                     "pct": pct, "level": level, "high_is_bad": high_is_bad})
    return bars


def score(ingredients: list[str], nutrition: dict) -> dict:
    base = _base_0_100(nutrition)
    penalty, india_flags = _india_flags(ingredients)
    overall = max(0, min(100, base - penalty))
    grade = grade_from_score(overall)

    bars = _nutrient_bars(nutrition)
    positives = [f"{b['label']} ({b['value_g']:g}g)"
                 for b in bars if (not b["high_is_bad"]) and b["level"] != "low"]
    negatives = [f"High {b['label'].lower()}"
                 for b in bars if b["high_is_bad"] and b["level"] == "high"]
    negatives += [f["label"] for f in india_flags]

    return {
        "overall": overall,
        "grade": grade,
        "verdict": _VERDICTS[grade],
        "positives": positives,
        "negatives": negatives,
        "breakdown": {"nutrients": bars, "india_flags": india_flags},
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_scorer.py -v`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/scoring/scorer.py backend/tests/test_scorer.py
git commit -m "feat: scorer with 0-100 scale, India penalties, breakdown"
```

---

### Task 5: Product repository

**Files:**
- Create: `backend/app/repositories/__init__.py` (empty)
- Create: `backend/app/repositories/products.py`
- Create: `backend/tests/test_products_repo.py`

- [ ] **Step 1: Create empty `backend/app/repositories/__init__.py`**

- [ ] **Step 2: Write the failing test** in `backend/tests/test_products_repo.py`

```python
import pytest
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository


@pytest.fixture
def repo():
    engine = make_engine("sqlite://")
    init_db(engine)
    return ProductRepository(make_session_factory(engine))


def test_get_missing_returns_none(repo):
    assert repo.get("does-not-exist") is None


def test_save_then_get_roundtrips(repo):
    repo.save(barcode="111", name="Chana", brand="Tata",
              ingredients=["chana"], nutrition={"sugars_g": 1.0},
              score={"overall": 84, "grade": "A", "breakdown": {}}, source="off")
    p = repo.get("111")
    assert p["name"] == "Chana"
    assert p["score"]["overall"] == 84
    assert p["source"] == "off"


def test_save_is_idempotent_upsert(repo):
    repo.save(barcode="111", name="Old", brand="B", ingredients=[],
              nutrition={}, score={"overall": 10, "grade": "E", "breakdown": {}}, source="off")
    repo.save(barcode="111", name="New", brand="B", ingredients=[],
              nutrition={}, score={"overall": 90, "grade": "A", "breakdown": {}}, source="photo")
    p = repo.get("111")
    assert p["name"] == "New"
    assert p["score"]["overall"] == 90
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest tests/test_products_repo.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.repositories.products'`

- [ ] **Step 4: Write `backend/app/repositories/products.py`**

```python
from sqlalchemy import select
from app.models import Product


class ProductRepository:
    """Read/write products in SQLite, keyed by barcode. Returns plain dicts."""

    def __init__(self, session_factory):
        self._Session = session_factory

    def get(self, barcode: str) -> dict | None:
        with self._Session() as s:
            p = s.scalar(select(Product).where(Product.barcode == barcode))
            return self._to_dict(p) if p else None

    def save(self, *, barcode: str, name: str, brand: str,
             ingredients: list, nutrition: dict, score: dict, source: str) -> None:
        with self._Session() as s:
            p = s.get(Product, barcode)
            if p is None:
                p = Product(barcode=barcode)
                s.add(p)
            p.name = name
            p.brand = brand
            p.ingredients = ingredients
            p.nutrition = nutrition
            p.score_overall = score["overall"]
            p.score_grade = score["grade"]
            p.score_breakdown = score.get("breakdown", {})
            p.source = source
            s.commit()

    @staticmethod
    def _to_dict(p: Product) -> dict:
        return {
            "barcode": p.barcode, "name": p.name, "brand": p.brand,
            "ingredients": p.ingredients, "nutrition": p.nutrition,
            "score": {"overall": p.score_overall, "grade": p.score_grade,
                      "breakdown": p.score_breakdown},
            "source": p.source,
        }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_products_repo.py -v`
Expected: PASS (3 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/app/repositories backend/tests/test_products_repo.py
git commit -m "feat: ProductRepository with upsert and dict mapping"
```

---

### Task 6: OpenFoodFacts client

**Files:**
- Create: `backend/app/clients/__init__.py` (empty)
- Create: `backend/app/clients/openfoodfacts.py`
- Create: `backend/tests/test_openfoodfacts.py`

- [ ] **Step 1: Create empty `backend/app/clients/__init__.py`**

- [ ] **Step 2: Write the failing test** in `backend/tests/test_openfoodfacts.py`

```python
import httpx
import respx
from app.clients.openfoodfacts import OpenFoodFactsClient

URL = "https://world.openfoodfacts.org/api/v2/product/111.json"

@respx.mock
def test_fetch_maps_fields_when_found():
    respx.get(URL).mock(return_value=httpx.Response(200, json={
        "status": 1,
        "product": {
            "product_name": "Chana", "brands": "Tata",
            "ingredients_text": "Chickpeas, Salt",
            "nutriments": {"energy-kj_100g": 1500, "sugars_100g": 2,
                           "saturated-fat_100g": 0.5, "salt_100g": 0.3,
                           "fiber_100g": 5, "proteins_100g": 9},
        },
    }))
    client = OpenFoodFactsClient()
    result = client.fetch("111")
    assert result["name"] == "Chana"
    assert result["brand"] == "Tata"
    assert "chickpeas" in result["ingredients"]
    assert result["nutrition"]["sugars_g"] == 2
    assert result["nutrition"]["fibre_g"] == 5

@respx.mock
def test_fetch_returns_none_when_not_found():
    respx.get(URL).mock(return_value=httpx.Response(200, json={"status": 0}))
    assert OpenFoodFactsClient().fetch("111") is None

@respx.mock
def test_fetch_returns_none_on_http_error():
    respx.get(URL).mock(return_value=httpx.Response(500))
    assert OpenFoodFactsClient().fetch("111") is None
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest tests/test_openfoodfacts.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.clients.openfoodfacts'`

- [ ] **Step 4: Write `backend/app/clients/openfoodfacts.py`**

```python
import httpx

_BASE = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"


def _split_ingredients(text: str) -> list[str]:
    if not text:
        return []
    parts = text.replace(";", ",").split(",")
    return [p.strip().lower() for p in parts if p.strip()]


def _map_nutrition(n: dict) -> dict:
    g = lambda k: float(n.get(k, 0) or 0)
    return {
        "energy_kj": g("energy-kj_100g"),
        "sugars_g": g("sugars_100g"),
        "sat_fat_g": g("saturated-fat_100g"),
        "salt_g": g("salt_100g"),
        "fibre_g": g("fiber_100g"),
        "protein_g": g("proteins_100g"),
        "fruit_veg_nuts_pct": g("fruits-vegetables-nuts-estimate-from-ingredients_100g"),
    }


class OpenFoodFactsClient:
    """Fetches a product from OpenFoodFacts and normalizes it to our shape."""

    def __init__(self, timeout: float = 6.0):
        self._timeout = timeout

    def fetch(self, barcode: str) -> dict | None:
        try:
            resp = httpx.get(_BASE.format(barcode=barcode), timeout=self._timeout,
                             headers={"User-Agent": "NutriScan/0.1"})
        except httpx.HTTPError:
            return None
        if resp.status_code != 200:
            return None
        data = resp.json()
        if data.get("status") != 1 or "product" not in data:
            return None
        p = data["product"]
        nutrition = _map_nutrition(p.get("nutriments", {}))
        return {
            "name": p.get("product_name", "") or "",
            "brand": (p.get("brands", "") or "").split(",")[0].strip(),
            "ingredients": _split_ingredients(p.get("ingredients_text", "")),
            "nutrition": nutrition,
        }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_openfoodfacts.py -v`
Expected: PASS (3 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/app/clients backend/tests/test_openfoodfacts.py
git commit -m "feat: OpenFoodFacts client with normalization"
```

---

### Task 7: Label extractor (OpenRouter vision, behind an interface)

**Files:**
- Create: `backend/app/clients/label_extractor.py`
- Create: `backend/tests/test_label_extractor.py`

- [ ] **Step 1: Write the failing test** in `backend/tests/test_label_extractor.py`

```python
import json
import httpx
import respx
import pytest
from app.clients.label_extractor import LabelExtractor, ExtractionError

URL = "https://openrouter.ai/api/v1/chat/completions"

def _openrouter_response(payload: dict) -> httpx.Response:
    return httpx.Response(200, json={
        "choices": [{"message": {"content": json.dumps(payload)}}]
    })

@respx.mock
def test_extract_parses_structured_json():
    respx.post(URL).mock(return_value=_openrouter_response({
        "name": "Chips", "brand": "Lays",
        "ingredients": ["Potato", "Palm Oil", "Salt"],
        "nutrition": {"energy_kj": 2200, "sugars_g": 2, "sat_fat_g": 11,
                      "salt_g": 1.6, "fibre_g": 3, "protein_g": 6},
    }))
    ext = LabelExtractor(api_key="k", model="m", url=URL)
    result = ext.extract(b"fakeimage")
    assert result["name"] == "Chips"
    assert "palm oil" in result["ingredients"]
    assert result["nutrition"]["sat_fat_g"] == 11

@respx.mock
def test_extract_raises_on_unparseable_content():
    respx.post(URL).mock(return_value=httpx.Response(200, json={
        "choices": [{"message": {"content": "sorry I cannot read this"}}]
    }))
    ext = LabelExtractor(api_key="k", model="m", url=URL)
    with pytest.raises(ExtractionError):
        ext.extract(b"fakeimage")

@respx.mock
def test_extract_raises_on_http_error():
    respx.post(URL).mock(return_value=httpx.Response(500))
    ext = LabelExtractor(api_key="k", model="m", url=URL)
    with pytest.raises(ExtractionError):
        ext.extract(b"fakeimage")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_label_extractor.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.clients.label_extractor'`

- [ ] **Step 3: Write `backend/app/clients/label_extractor.py`**

```python
import base64
import json
import httpx

_PROMPT = (
    "You are reading a packaged food label. Return ONLY a JSON object with keys: "
    "name (string), brand (string), ingredients (array of lowercase strings), and "
    "nutrition (object with numeric per-100g keys: energy_kj, sugars_g, sat_fat_g, "
    "salt_g, fibre_g, protein_g). Use 0 for any value you cannot read. No prose."
)


class ExtractionError(Exception):
    """Raised when the vision model output cannot be parsed into label data."""


def _normalize_nutrition(n: dict) -> dict:
    g = lambda k: float(n.get(k, 0) or 0)
    return {
        "energy_kj": g("energy_kj"), "sugars_g": g("sugars_g"),
        "sat_fat_g": g("sat_fat_g"), "salt_g": g("salt_g"),
        "fibre_g": g("fibre_g"), "protein_g": g("protein_g"),
        "fruit_veg_nuts_pct": g("fruit_veg_nuts_pct"),
    }


class LabelExtractor:
    """Extracts structured label data from an image via an OpenRouter vision model.
    The model is swappable via the `model` argument (config-driven)."""

    def __init__(self, api_key: str, model: str, url: str, timeout: float = 30.0):
        self._api_key = api_key
        self._model = model
        self._url = url
        self._timeout = timeout

    def extract(self, image_bytes: bytes) -> dict:
        b64 = base64.b64encode(image_bytes).decode("ascii")
        body = {
            "model": self._model,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": _PROMPT},
                    {"type": "image_url",
                     "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                ],
            }],
            "response_format": {"type": "json_object"},
        }
        try:
            resp = httpx.post(self._url, json=body, timeout=self._timeout,
                              headers={"Authorization": f"Bearer {self._api_key}"})
        except httpx.HTTPError as e:
            raise ExtractionError(str(e)) from e
        if resp.status_code != 200:
            raise ExtractionError(f"openrouter status {resp.status_code}")
        content = resp.json()["choices"][0]["message"]["content"]
        try:
            data = json.loads(content)
        except (json.JSONDecodeError, TypeError) as e:
            raise ExtractionError("model did not return JSON") from e
        return {
            "name": data.get("name", "") or "",
            "brand": data.get("brand", "") or "",
            "ingredients": [str(i).lower() for i in data.get("ingredients", [])],
            "nutrition": _normalize_nutrition(data.get("nutrition", {})),
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_label_extractor.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/clients/label_extractor.py backend/tests/test_label_extractor.py
git commit -m "feat: OpenRouter label extractor with structured JSON output"
```

---

### Task 8: Rate limiter

**Files:**
- Create: `backend/app/services/__init__.py` (empty)
- Create: `backend/app/services/rate_limiter.py`
- Create: `backend/tests/test_rate_limiter.py`

- [ ] **Step 1: Create empty `backend/app/services/__init__.py`**

- [ ] **Step 2: Write the failing test** in `backend/tests/test_rate_limiter.py`

```python
import pytest
from app.db import make_engine, make_session_factory, init_db
from app.services.rate_limiter import RateLimiter


@pytest.fixture
def limiter():
    engine = make_engine("sqlite://")
    init_db(engine)
    return RateLimiter(make_session_factory(engine), guest_limit=3, free_limit=10)


def test_guest_allowed_until_limit(limiter):
    for expected_remaining in (2, 1, 0):
        res = limiter.check_and_consume("guest:abc", "guest", day="2026-05-31")
        assert res["allowed"] is True
        assert res["remaining"] == expected_remaining
    blocked = limiter.check_and_consume("guest:abc", "guest", day="2026-05-31")
    assert blocked["allowed"] is False
    assert blocked["remaining"] == 0


def test_free_has_higher_limit(limiter):
    res = None
    for _ in range(10):
        res = limiter.check_and_consume("user:1", "free", day="2026-05-31")
    assert res["allowed"] is True
    assert limiter.check_and_consume("user:1", "free", day="2026-05-31")["allowed"] is False


def test_limit_resets_next_day(limiter):
    for _ in range(3):
        limiter.check_and_consume("guest:abc", "guest", day="2026-05-31")
    assert limiter.check_and_consume("guest:abc", "guest", day="2026-05-31")["allowed"] is False
    nextday = limiter.check_and_consume("guest:abc", "guest", day="2026-06-01")
    assert nextday["allowed"] is True
    assert nextday["remaining"] == 2
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest tests/test_rate_limiter.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.rate_limiter'`

- [ ] **Step 4: Write `backend/app/services/rate_limiter.py`**

```python
from sqlalchemy import select
from app.models import DailyScan


class RateLimiter:
    """Tracks and enforces per-identity daily scan allowances in SQLite.
    `day` is injected (ISO 'YYYY-MM-DD') so behavior is deterministic and testable."""

    def __init__(self, session_factory, guest_limit: int, free_limit: int):
        self._Session = session_factory
        self._limits = {"guest": guest_limit, "free": free_limit}

    def _limit_for(self, tier: str) -> int:
        return self._limits.get(tier, self._limits["guest"])

    def check_and_consume(self, identity: str, tier: str, day: str) -> dict:
        limit = self._limit_for(tier)
        with self._Session() as s:
            row = s.scalar(
                select(DailyScan).where(
                    DailyScan.identity == identity, DailyScan.day == day))
            current = row.count if row else 0
            if current >= limit:
                return {"allowed": False, "remaining": 0, "limit": limit}
            if row is None:
                row = DailyScan(identity=identity, day=day, count=0)
                s.add(row)
            row.count = current + 1
            s.commit()
            return {"allowed": True, "remaining": limit - row.count, "limit": limit}

    def remaining(self, identity: str, tier: str, day: str) -> int:
        limit = self._limit_for(tier)
        with self._Session() as s:
            row = s.scalar(
                select(DailyScan).where(
                    DailyScan.identity == identity, DailyScan.day == day))
            return max(0, limit - (row.count if row else 0))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_rate_limiter.py -v`
Expected: PASS (3 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/__init__.py backend/app/services/rate_limiter.py backend/tests/test_rate_limiter.py
git commit -m "feat: SQLite-backed daily rate limiter (guest/free tiers)"
```

---

### Task 9: Auth (guest identity + email login + token validation)

**Files:**
- Create: `backend/app/services/auth.py`
- Create: `backend/tests/test_auth.py`

> Scope note: Google OAuth is a future enhancement (see spec §11). This MVP uses
> opaque tokens: a guest token derived from a client device id, and an email login
> that creates/returns a user. Tokens are signed with an app secret.

- [ ] **Step 1: Write the failing test** in `backend/tests/test_auth.py`

```python
import pytest
from app.db import make_engine, make_session_factory, init_db
from app.services.auth import AuthService, AuthError


@pytest.fixture
def auth():
    engine = make_engine("sqlite://")
    init_db(engine)
    return AuthService(make_session_factory(engine), secret="test-secret")


def test_guest_token_roundtrips_to_identity(auth):
    token = auth.guest_token("device-123")
    identity = auth.identify(token)
    assert identity["tier"] == "guest"
    assert identity["id"] == "guest:device-123"


def test_email_login_creates_user_and_token(auth):
    token = auth.login_email("a@b.com")
    identity = auth.identify(token)
    assert identity["tier"] == "free"
    assert identity["id"].startswith("user:")


def test_email_login_is_idempotent_same_user(auth):
    t1 = auth.login_email("a@b.com")
    t2 = auth.login_email("a@b.com")
    assert auth.identify(t1)["id"] == auth.identify(t2)["id"]


def test_tampered_token_rejected(auth):
    token = auth.guest_token("device-123")
    with pytest.raises(AuthError):
        auth.identify(token + "x")


def test_missing_token_rejected(auth):
    with pytest.raises(AuthError):
        auth.identify("")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_auth.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.auth'`

- [ ] **Step 3: Write `backend/app/services/auth.py`**

```python
import hashlib
import hmac
from sqlalchemy import select
from app.models import User


class AuthError(Exception):
    """Raised when a token is missing, malformed, or fails signature check."""


def _sign(payload: str, secret: str) -> str:
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


class AuthService:
    """Issues and validates opaque signed tokens.
    Token format: '<payload>.<hexsig>' where payload is 'guest:<device>' or 'user:<id>'."""

    def __init__(self, session_factory, secret: str):
        self._Session = session_factory
        self._secret = secret

    def _make_token(self, payload: str) -> str:
        return f"{payload}.{_sign(payload, self._secret)}"

    def guest_token(self, device_id: str) -> str:
        if not device_id:
            raise AuthError("device id required")
        return self._make_token(f"guest:{device_id}")

    def login_email(self, email: str) -> str:
        if not email or "@" not in email:
            raise AuthError("valid email required")
        with self._Session() as s:
            user = s.scalar(select(User).where(User.email == email))
            if user is None:
                user = User(email=email, auth_provider="email", tier="free")
                s.add(user)
                s.commit()
            return self._make_token(f"user:{user.id}")

    def identify(self, token: str) -> dict:
        if not token or "." not in token:
            raise AuthError("malformed token")
        payload, sig = token.rsplit(".", 1)
        if not hmac.compare_digest(sig, _sign(payload, self._secret)):
            raise AuthError("bad signature")
        tier = "guest" if payload.startswith("guest:") else "free"
        return {"id": payload, "tier": tier}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_auth.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auth.py backend/tests/test_auth.py
git commit -m "feat: signed-token auth (guest + email login)"
```

---

### Task 10: Scan service (pipeline orchestration)

**Files:**
- Create: `backend/app/services/scan.py`
- Create: `backend/tests/test_scan_service.py`

- [ ] **Step 1: Write the failing test** in `backend/tests/test_scan_service.py`

```python
import pytest
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository
from app.services.scan import ScanService, ProductNotFound

HEALTHY = {"energy_kj": 300, "sugars_g": 2, "sat_fat_g": 0.5, "salt_g": 0.1,
           "fibre_g": 5, "protein_g": 9, "fruit_veg_nuts_pct": 0}


class FakeOFF:
    def __init__(self, result): self.result = result; self.calls = 0
    def fetch(self, barcode):
        self.calls += 1
        return self.result


class FakeExtractor:
    def __init__(self, result): self.result = result
    def extract(self, image_bytes): return self.result


@pytest.fixture
def repo():
    engine = make_engine("sqlite://")
    init_db(engine)
    return ProductRepository(make_session_factory(engine))


def test_db_hit_returns_cached_and_skips_off(repo):
    repo.save(barcode="111", name="Cached", brand="B", ingredients=["x"],
              nutrition=HEALTHY, score={"overall": 84, "grade": "A", "breakdown": {}},
              source="off")
    off = FakeOFF(None)
    svc = ScanService(repo, off, FakeExtractor(None))
    res = svc.scan_barcode("111")
    assert res["source"] == "db"
    assert res["product"]["name"] == "Cached"
    assert off.calls == 0


def test_off_fallback_scores_and_caches(repo):
    off = FakeOFF({"name": "Chana", "brand": "Tata", "ingredients": ["chana"],
                   "nutrition": HEALTHY})
    svc = ScanService(repo, off, FakeExtractor(None))
    res = svc.scan_barcode("222")
    assert res["source"] == "off"
    assert res["product"]["score"]["grade"] == "A"
    # now cached -> second call is a db hit
    res2 = svc.scan_barcode("222")
    assert res2["source"] == "db"


def test_barcode_not_found_raises(repo):
    svc = ScanService(repo, FakeOFF(None), FakeExtractor(None))
    with pytest.raises(ProductNotFound):
        svc.scan_barcode("333")


def test_photo_path_extracts_scores_and_caches(repo):
    extractor = FakeExtractor({"name": "Chips", "brand": "Lays",
                               "ingredients": ["potato", "palm oil"],
                               "nutrition": HEALTHY})
    svc = ScanService(repo, FakeOFF(None), extractor)
    res = svc.scan_photo("444", b"img")
    assert res["source"] == "photo"
    assert res["product"]["name"] == "Chips"
    assert repo.get("444") is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_scan_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.scan'`

- [ ] **Step 3: Write `backend/app/services/scan.py`**

```python
from app.scoring.scorer import score as score_fn


class ProductNotFound(Exception):
    """Raised when a barcode is in neither our DB nor OpenFoodFacts (needs a photo)."""


class ScanService:
    """Orchestrates the scan pipeline: our DB -> OpenFoodFacts -> (caller) photo.
    Newly resolved products are scored and written back so future scans are DB hits."""

    def __init__(self, product_repo, off_client, label_extractor):
        self._repo = product_repo
        self._off = off_client
        self._extractor = label_extractor

    def scan_barcode(self, barcode: str) -> dict:
        cached = self._repo.get(barcode)
        if cached is not None:
            return {"source": "db", "product": cached}

        off_data = self._off.fetch(barcode)
        if off_data is not None:
            product = self._score_and_cache(barcode, off_data, source="off")
            return {"source": "off", "product": product}

        raise ProductNotFound(barcode)

    def scan_photo(self, barcode: str, image_bytes: bytes) -> dict:
        data = self._extractor.extract(image_bytes)
        product = self._score_and_cache(barcode, data, source="photo")
        return {"source": "photo", "product": product}

    def _score_and_cache(self, barcode: str, data: dict, source: str) -> dict:
        scored = score_fn(data["ingredients"], data["nutrition"])
        self._repo.save(
            barcode=barcode, name=data["name"], brand=data["brand"],
            ingredients=data["ingredients"], nutrition=data["nutrition"],
            score=scored, source=source,
        )
        return self._repo.get(barcode)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_scan_service.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/scan.py backend/tests/test_scan_service.py
git commit -m "feat: ScanService pipeline (db -> OFF -> photo) with caching"
```

---

### Task 11: API endpoints and app assembly

**Files:**
- Create: `backend/app/schemas.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/test_api.py`

- [ ] **Step 1: Write the failing test** in `backend/tests/test_api.py`

```python
import io
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.db import make_engine, make_session_factory, init_db

HEALTHY = {"energy_kj": 300, "sugars_g": 2, "sat_fat_g": 0.5, "salt_g": 0.1,
           "fibre_g": 5, "protein_g": 9, "fruit_veg_nuts_pct": 0}


class FakeOFF:
    def __init__(self, result): self.result = result
    def fetch(self, barcode): return self.result


class FakeExtractor:
    def __init__(self, result): self.result = result
    def extract(self, image_bytes): return self.result


def build_client(off_result=None, extractor_result=None):
    engine = make_engine("sqlite://")
    init_db(engine)
    sf = make_session_factory(engine)
    app = create_app(session_factory=sf, off_client=FakeOFF(off_result),
                     label_extractor=FakeExtractor(extractor_result),
                     secret="test", guest_limit=3, free_limit=10, today="2026-05-31")
    return TestClient(app)


def _guest_headers(client):
    token = client.post("/auth/guest", json={"device_id": "d1"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_guest_auth_then_scan_off_hit():
    client = build_client(off_result={"name": "Chana", "brand": "Tata",
                                      "ingredients": ["chana"], "nutrition": HEALTHY})
    headers = _guest_headers(client)
    r = client.post("/scan/barcode", json={"barcode": "222"}, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["product"]["score"]["grade"] == "A"
    assert body["remaining"] == 2


def test_barcode_not_found_returns_404_needs_photo():
    client = build_client(off_result=None)
    headers = _guest_headers(client)
    r = client.post("/scan/barcode", json={"barcode": "999"}, headers=headers)
    assert r.status_code == 404
    assert r.json()["detail"]["needs_photo"] is True


def test_photo_scan_returns_score():
    client = build_client(extractor_result={"name": "Chips", "brand": "Lays",
                          "ingredients": ["potato", "palm oil"], "nutrition": HEALTHY})
    headers = _guest_headers(client)
    files = {"image": ("label.jpg", io.BytesIO(b"img"), "image/jpeg")}
    r = client.post("/scan/photo", data={"barcode": "444"}, files=files, headers=headers)
    assert r.status_code == 200
    assert r.json()["product"]["name"] == "Chips"


def test_rate_limit_blocks_after_quota():
    client = build_client(off_result={"name": "X", "brand": "Y",
                          "ingredients": ["a"], "nutrition": HEALTHY})
    headers = _guest_headers(client)
    for _ in range(3):
        client.post("/scan/barcode", json={"barcode": "222"}, headers=headers)
    # 222 is now cached (db hits still consume quota) -> 4th call blocked
    r = client.post("/scan/barcode", json={"barcode": "222"}, headers=headers)
    assert r.status_code == 429


def test_missing_auth_returns_401():
    client = build_client()
    r = client.post("/scan/barcode", json={"barcode": "222"})
    assert r.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_api.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.main'`

- [ ] **Step 3: Write `backend/app/schemas.py`**

```python
from pydantic import BaseModel


class GuestRequest(BaseModel):
    device_id: str


class EmailLoginRequest(BaseModel):
    email: str


class TokenResponse(BaseModel):
    token: str


class BarcodeRequest(BaseModel):
    barcode: str
```

- [ ] **Step 4: Write `backend/app/main.py`**

```python
from fastapi import FastAPI, Depends, Header, HTTPException, Form, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository
from app.clients.openfoodfacts import OpenFoodFactsClient
from app.clients.label_extractor import LabelExtractor, ExtractionError
from app.services.rate_limiter import RateLimiter
from app.services.auth import AuthService, AuthError
from app.services.scan import ScanService, ProductNotFound
from app.schemas import GuestRequest, EmailLoginRequest, TokenResponse, BarcodeRequest


def create_app(*, session_factory, off_client, label_extractor, secret,
               guest_limit, free_limit, today=None):
    """Build the app from injected dependencies. `today` (ISO date) is injectable
    for deterministic tests; in production it is computed per-request."""
    app = FastAPI(title="NutriScan API")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                       allow_headers=["*"])

    auth = AuthService(session_factory, secret=secret)
    limiter = RateLimiter(session_factory, guest_limit=guest_limit, free_limit=free_limit)
    scanner = ScanService(ProductRepository(session_factory), off_client, label_extractor)

    def _today() -> str:
        if today is not None:
            return today
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).date().isoformat()

    def current_identity(authorization: str = Header(default="")) -> dict:
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="missing bearer token")
        try:
            return auth.identify(authorization[len("Bearer "):])
        except AuthError as e:
            raise HTTPException(status_code=401, detail=str(e))

    def _consume(identity: dict) -> int:
        res = limiter.check_and_consume(identity["id"], identity["tier"], day=_today())
        if not res["allowed"]:
            raise HTTPException(status_code=429,
                                detail={"error": "daily scan limit reached",
                                        "limit": res["limit"]})
        return res["remaining"]

    @app.post("/auth/guest", response_model=TokenResponse)
    def auth_guest(req: GuestRequest):
        try:
            return {"token": auth.guest_token(req.device_id)}
        except AuthError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.post("/auth/login", response_model=TokenResponse)
    def auth_login(req: EmailLoginRequest):
        try:
            return {"token": auth.login_email(req.email)}
        except AuthError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.post("/scan/barcode")
    def scan_barcode(req: BarcodeRequest, identity: dict = Depends(current_identity)):
        remaining = _consume(identity)
        try:
            result = scanner.scan_barcode(req.barcode)
        except ProductNotFound:
            raise HTTPException(status_code=404,
                                detail={"error": "product not found",
                                        "needs_photo": True})
        return {**result, "remaining": remaining}

    @app.post("/scan/photo")
    async def scan_photo(barcode: str = Form(...), image: UploadFile = File(...),
                         identity: dict = Depends(current_identity)):
        remaining = _consume(identity)
        image_bytes = await image.read()
        try:
            result = scanner.scan_photo(barcode, image_bytes)
        except ExtractionError:
            raise HTTPException(status_code=422,
                                detail={"error": "could not read label, retake photo"})
        return {**result, "remaining": remaining}

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


def app_from_settings() -> FastAPI:
    settings = get_settings()
    engine = make_engine(settings.db_url)
    init_db(engine)
    sf = make_session_factory(engine)
    return create_app(
        session_factory=sf,
        off_client=OpenFoodFactsClient(),
        label_extractor=LabelExtractor(
            api_key=settings.openrouter_api_key, model=settings.vision_model,
            url=settings.openrouter_url),
        secret=settings.openrouter_api_key or "dev-secret",
        guest_limit=settings.guest_daily_limit,
        free_limit=settings.free_daily_limit,
    )


app = app_from_settings()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_api.py -v`
Expected: PASS (5 passed)

- [ ] **Step 6: Run the full suite**

Run: `cd backend && pytest -v`
Expected: PASS (all tests across every module green)

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas.py backend/app/main.py backend/tests/test_api.py
git commit -m "feat: FastAPI app — auth, barcode/photo scan, rate-limit wiring"
```

---

### Task 12: Run the server end-to-end (manual smoke test)

**Files:**
- Create: `backend/README.md`

- [ ] **Step 1: Write `backend/README.md`**

````markdown
# NutriScan Backend

## Setup
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env   # then set NUTRISCAN_OPENROUTER_API_KEY
```

## Run
```bash
uvicorn app.main:app --reload --port 8000
```

## Test
```bash
pytest -v
```

## Manual smoke test
```bash
# 1. Get a guest token
TOKEN=$(curl -s localhost:8000/auth/guest -H 'Content-Type: application/json' \
  -d '{"device_id":"dev1"}' | python -c 'import sys,json;print(json.load(sys.stdin)["token"])')

# 2. Scan a real barcode that exists in OpenFoodFacts (e.g. a common product)
curl -s localhost:8000/scan/barcode -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"barcode":"8901058000177"}' | python -m json.tool
```
````

- [ ] **Step 2: Start the server**

Run: `cd backend && uvicorn app.main:app --port 8000`
Expected: Uvicorn logs "Application startup complete" and `GET /health` returns `{"status":"ok"}`.

- [ ] **Step 3: Run the smoke test from the README**

Run the two curl commands in `backend/README.md` (a real OpenFoodFacts barcode).
Expected: `/auth/guest` returns a token; `/scan/barcode` returns JSON with `product.score.grade` and `remaining` decremented. A second identical scan returns `"source":"db"`.

- [ ] **Step 4: Commit**

```bash
git add backend/README.md
git commit -m "docs: backend README with setup and smoke test"
```

---

## Self-Review (completed during authoring)

**Spec coverage:** Scan flow (Tasks 5,6,7,10), guest/free tiers + limits (Tasks 8,9,11), our-DB caching flywheel (Tasks 5,10), OpenFoodFacts fallback (Task 6), label-photo extraction via swappable OpenRouter model (Task 7), Nutri-Score + India penalties single 0–100 score with breakdown (Tasks 3,4), SQLite data model Product/User/DailyScan (Task 2), error handling — barcode-not-found→needs_photo 404, unreadable label→422, rate-limit→429, bad auth→401 (Task 11). Future items (Google OAuth, reformulation re-scan, paid tiers, personalized scoring) intentionally deferred per spec §3/§11.

**Frontend** is deliberately out of scope here — it gets its own plan (Plan 2), built against this API.

**Placeholder scan:** none — every code step is complete.

**Type consistency:** the nutrition dict, ingredients list, and score-result shapes are consistent across nutriscore → scorer → scan service → repository → API. `score()` signature `(ingredients, nutrition)` is used identically in Tasks 4 and 10. Repository `save(...)`/`get(...)` and the `{"source","product"}` result envelope match between Tasks 5, 10, and 11.
