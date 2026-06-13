# Daily Diet Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users log packaged scans and snapped meals to a daily food log, and see their day's 6 macros vs personal targets with low/over flags.

**Architecture:** A new immutable `FoodLogEntry` table + lazy `Profile`. Pure `app/nutrition/targets.py` computes targets and summarizes a day. A `DietRepository` does CRUD; new `/diet/*` routes (gated to signed-in users) live in `create_app` alongside the existing scan/catalog routes. A `MealEstimator` mirrors `LabelExtractor` for the photo path. Frontend adds a "Today" tab, a portion sheet, an "Add to today" button on results, and a meal-snap → confirm flow.

**Tech Stack:** FastAPI + SQLAlchemy 2.x + SQLite (backend, pytest); React 18 + TS + Vite (frontend, vitest). OpenRouter vision (gemini-2.5-flash) for meal estimation.

**Spec:** `docs/superpowers/specs/2026-06-13-daily-diet-tracking-design.md`. **Mockup:** `docs/mockups/diet-tracking-mockup.html`.

**Conventions already in the codebase (do not reinvent):**
- Macro keys everywhere: `("energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g")`.
- Auth: `auth.identify(token) -> {"id": "user:<n>"|"guest:<dev>", "tier": "guest"|"free"}`. Routes get it via `Depends(current_identity)`.
- Run backend tests: `backend/.venv/bin/pytest`. Run one: `backend/.venv/bin/pytest tests/test_x.py::test_y -v`.
- Run frontend tests: `cd frontend && npx vitest run <file>`.
- Commit messages: end with the Co-Authored-By trailer used in this repo.

---

## File structure

**Backend (new):**
- `app/nutrition/__init__.py`, `app/nutrition/targets.py` — pure targets + day summary.
- `app/repositories/diet.py` — `DietRepository` (log CRUD + profile).
- `app/services/meal_estimator.py` — `MealEstimator` (vision → dish estimate).
- `tests/test_targets.py`, `tests/test_diet_repo.py`, `tests/test_diet_api.py`, `tests/test_meal_estimator.py`.

**Backend (modified):**
- `app/models.py` — add `FoodLogEntry`, `Profile`, `Product.serving_size_g`.
- `app/db.py` — add `serving_size_g` to `_ADDED_COLUMNS["products"]`.
- `app/schemas.py` — add `DietLogRequest`, `ProfileRequest`.
- `app/main.py` — `current_user` guard + `/diet/*` routes; inject `DietRepository` + `MealEstimator`.
- `app/clients/openfoodfacts.py` — parse `serving_size` → grams (Task 13).

**Frontend (new):**
- `src/api/diet.ts` — diet API client + types.
- `src/diet/portion.ts` — `portionMacros` + serving defaults.
- `src/components/PortionSheet.tsx` (+ `.module.css`).
- `src/screens/TodayScreen.tsx` (+ `.module.css`).
- `src/screens/ConfirmMealScreen.tsx` (+ `.module.css`).
- `src/screens/TargetsScreen.tsx` (+ `.module.css`).
- test files alongside.

**Frontend (modified):**
- `src/session/nav.ts`, `src/components/TabBar.tsx` — add "today" tab + screens.
- `src/screens/ResultScreen.tsx` — "Add to today" button.
- `src/App.tsx` — render new screens + guest gating.

---

# PHASE 1 — Backend core (a loggable, summarizable day)

### Task 1: Pure targets + day summary module

**Files:**
- Create: `app/nutrition/__init__.py` (empty)
- Create: `app/nutrition/targets.py`
- Test: `tests/test_targets.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_targets.py
from app.nutrition.targets import compute_targets, summarize_day, MACRO_KEYS


def test_defaults_when_no_profile():
    t = compute_targets(None)
    assert t["protein_g"] == 50.0 and t["fibre_g"] == 30.0
    assert t["sugars_g"] == 50.0 and t["salt_g"] == 5.0 and t["sat_fat_g"] == 22.0
    assert 8000 < t["energy_kj"] < 8800  # ~2000 kcal
    assert set(t) == set(MACRO_KEYS)


def test_overrides_win_per_macro():
    t = compute_targets({"target_overrides": {"protein_g": 80, "sugars_g": 0, "x": 9}})
    assert t["protein_g"] == 80.0        # applied
    assert t["sugars_g"] == 50.0         # 0 ignored (must be > 0)
    assert t["fibre_g"] == 30.0          # untouched


def _entry(**kw):
    base = {k: 0.0 for k in MACRO_KEYS}
    base.update(kw)
    return base


def test_summary_totals_and_status():
    targets = compute_targets(None)
    entries = [_entry(protein_g=38, fibre_g=11, sugars_g=61, salt_g=4.1, sat_fat_g=14, energy_kj=6000)]
    s = summarize_day(entries, targets)
    assert s["totals"]["protein_g"] == 38
    assert s["status"]["protein_g"] == "low"   # hit nutrient under target
    assert s["status"]["fibre_g"] == "low"
    assert s["status"]["sugars_g"] == "over"   # limit nutrient over target
    assert s["status"]["salt_g"] == "ok"
    assert "low on fibre & protein" in s["headline"]
    assert "over on sugar" in s["headline"]


def test_empty_day_headline():
    s = summarize_day([], compute_targets(None))
    assert s["totals"]["protein_g"] == 0
    assert "Nothing logged" in s["headline"]


def test_on_track_headline():
    targets = compute_targets(None)
    entries = [_entry(protein_g=60, fibre_g=35, sugars_g=10, salt_g=1, sat_fat_g=5, energy_kj=3000)]
    s = summarize_day(entries, targets)
    assert s["status"]["protein_g"] == "ok" and s["status"]["fibre_g"] == "ok"
    assert "On track" in s["headline"]
```

- [ ] **Step 2: Run to verify it fails**

Run: `backend/.venv/bin/pytest tests/test_targets.py -q`
Expected: FAIL (`ModuleNotFoundError: app.nutrition.targets`).

- [ ] **Step 3: Implement**

```python
# app/nutrition/__init__.py
```
```python
# app/nutrition/targets.py
"""Pure daily-target math for diet tracking. No DB, no clock — callers pass data in.

Two nutrient roles:
- HIT  (protein, fibre): being UNDER the target is the problem -> status "low".
- LIMIT (energy, sugar, sat-fat, salt): being OVER is the problem -> status "over".
"""
MACRO_KEYS = ("energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g")
HIT = ("protein_g", "fibre_g")
LIMIT = ("energy_kj", "sugars_g", "sat_fat_g", "salt_g")

# Conservative adult guideline defaults (unisex). energy ~2000 kcal in kJ.
_DEFAULTS = {
    "energy_kj": 8368.0, "protein_g": 50.0, "fibre_g": 30.0,
    "sugars_g": 50.0, "sat_fat_g": 22.0, "salt_g": 5.0,
}
# Nutrients named in the headline (energy intentionally excluded — no calorie-shaming).
_HEADLINE_LOW = ("fibre_g", "protein_g")
_HEADLINE_OVER = ("sugars_g", "sat_fat_g", "salt_g")
_LABELS = {"energy_kj": "energy", "protein_g": "protein", "fibre_g": "fibre",
           "sugars_g": "sugar", "sat_fat_g": "sat fat", "salt_g": "salt"}


def compute_targets(profile: dict | None = None) -> dict:
    """Return the 6 daily targets. Smart defaults; explicit per-macro overrides win."""
    targets = dict(_DEFAULTS)
    overrides = ((profile or {}).get("target_overrides")) or {}
    for k in MACRO_KEYS:
        v = overrides.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0:
            targets[k] = float(v)
    return targets


def _status_for(macro: str, consumed: float, target: float) -> str:
    if macro in HIT:
        return "low" if consumed < target else "ok"
    return "over" if consumed > target else "ok"


def _join(names: list[str]) -> str:
    if len(names) <= 1:
        return names[0] if names else ""
    return " & ".join([", ".join(names[:-1]), names[-1]]) if len(names) > 2 else f"{names[0]} & {names[1]}"


def _headline(lows: list[str], overs: list[str], has_entries: bool) -> str:
    if not has_entries:
        return "Nothing logged yet — add your first food."
    parts = []
    if lows:
        parts.append("low on " + _join(lows))
    if overs:
        parts.append("over on " + _join(overs))
    if not parts:
        return "On track today — nice."
    return "You're " + ", and ".join(parts) + "."


def summarize_day(entries: list[dict], targets: dict) -> dict:
    """Sum macros across entries; derive per-macro status + a headline string."""
    totals = {k: 0.0 for k in MACRO_KEYS}
    for e in entries:
        for k in MACRO_KEYS:
            totals[k] += float(e.get(k, 0) or 0)
    status = {k: _status_for(k, totals[k], targets[k]) for k in MACRO_KEYS}
    lows = [_LABELS[k] for k in _HEADLINE_LOW if status[k] == "low"]
    overs = [_LABELS[k] for k in _HEADLINE_OVER if status[k] == "over"]
    return {"totals": totals, "status": status,
            "headline": _headline(lows, overs, bool(entries))}
```

- [ ] **Step 4: Run to verify pass**

Run: `backend/.venv/bin/pytest tests/test_targets.py -q`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/nutrition backend/tests/test_targets.py
git commit -m "feat(diet): pure targets + day-summary module"
```

---

### Task 2: Models + migration (FoodLogEntry, Profile, serving_size_g)

**Files:**
- Modify: `app/models.py`
- Modify: `app/db.py:13-21` (the `_ADDED_COLUMNS` dict)
- Test: `tests/test_diet_models.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# tests/test_diet_models.py
from app.db import make_engine, make_session_factory, init_db
from app.models import FoodLogEntry, Profile, Product


def _sf():
    e = make_engine("sqlite://")
    init_db(e)
    return make_session_factory(e)


def test_can_persist_food_log_entry():
    sf = _sf()
    with sf() as s:
        s.add(FoodLogEntry(identity="user:1", day="2026-06-13", kind="packaged",
                           name="Amul Lassi", brand="Amul", quantity_g=200.0,
                           energy_kj=260.0, sugars_g=29.0, protein_g=4.2))
        s.commit()
    with sf() as s:
        rows = list(s.query(FoodLogEntry).all())
        assert len(rows) == 1 and rows[0].sugars_g == 29.0 and rows[0].quantity_g == 200.0


def test_can_persist_profile_and_serving_size():
    sf = _sf()
    with sf() as s:
        s.add(Profile(identity="user:1", sex="m", target_overrides={"protein_g": 80}))
        s.add(Product(barcode="x", name="p", serving_size_g=30.0))
        s.commit()
    with sf() as s:
        assert s.get(Profile, "user:1").target_overrides == {"protein_g": 80}
        assert s.get(Product, "x").serving_size_g == 30.0
```

- [ ] **Step 2: Run to verify it fails**

Run: `backend/.venv/bin/pytest tests/test_diet_models.py -q`
Expected: FAIL (`ImportError: cannot import name 'FoodLogEntry'`).

- [ ] **Step 3: Implement — add to `app/models.py`**

Add `Float` to the sqlalchemy import line (currently `from sqlalchemy import String, Integer, JSON, DateTime, UniqueConstraint`):
```python
from sqlalchemy import String, Integer, Float, JSON, DateTime, UniqueConstraint
```
Add `serving_size_g` to the existing `Product` class (after `embedding`):
```python
    serving_size_g: Mapped[float | None] = mapped_column(Float, nullable=True)  # for portion default
```
Append two new models at the end of the file:
```python
class FoodLogEntry(Base):
    """One logged food for one day. Immutable record: macros are a frozen snapshot
    (per-100g x quantity_g / 100), so editing a product never changes past days."""
    __tablename__ = "food_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    identity: Mapped[str] = mapped_column(String, index=True)   # 'user:<n>'
    day: Mapped[str] = mapped_column(String, index=True)        # local 'YYYY-MM-DD'
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
```

- [ ] **Step 4: Implement — add the column migration in `app/db.py`**

In `_ADDED_COLUMNS`, change the `"products"` entry to include the new column:
```python
    "products": {"category": "VARCHAR DEFAULT ''", "image_url": "VARCHAR DEFAULT ''",
                 "embedding": "JSON", "serving_size_g": "FLOAT"},
```
(The `food_log` and `profiles` tables are brand-new, so `create_all()` makes them with all columns — no migration entry needed.)

- [ ] **Step 5: Run to verify pass**

Run: `backend/.venv/bin/pytest tests/test_diet_models.py -q`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/app/db.py backend/tests/test_diet_models.py
git commit -m "feat(diet): FoodLogEntry + Profile models + serving_size_g column"
```

---

### Task 3: DietRepository (log CRUD + profile)

**Files:**
- Create: `app/repositories/diet.py`
- Test: `tests/test_diet_repo.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_diet_repo.py
from app.db import make_engine, make_session_factory, init_db
from app.repositories.diet import DietRepository


def _repo():
    e = make_engine("sqlite://")
    init_db(e)
    return DietRepository(make_session_factory(e))


def _macros(**kw):
    base = {"energy_kj": 0, "sugars_g": 0, "sat_fat_g": 0, "salt_g": 0, "fibre_g": 0, "protein_g": 0}
    base.update(kw)
    return base


def test_add_and_list_day_scoped_by_user_and_day():
    r = _repo()
    e = r.add_entry(identity="user:1", day="2026-06-13", kind="packaged", name="Lassi",
                    brand="Amul", quantity_g=200, macros=_macros(sugars_g=29), barcode="b1")
    assert e["id"] > 0 and e["sugars_g"] == 29 and e["name"] == "Lassi"
    r.add_entry(identity="user:1", day="2026-06-12", kind="manual", name="Old", brand="",
                quantity_g=100, macros=_macros(sugars_g=5))
    r.add_entry(identity="user:2", day="2026-06-13", kind="manual", name="Other", brand="",
                quantity_g=100, macros=_macros(sugars_g=9))
    today = r.day_entries("user:1", "2026-06-13")
    assert [x["name"] for x in today] == ["Lassi"]   # only user:1's today


def test_delete_only_own_entry():
    r = _repo()
    e = r.add_entry(identity="user:1", day="2026-06-13", kind="manual", name="X", brand="",
                    quantity_g=100, macros=_macros())
    assert r.delete_entry("user:2", e["id"]) is False   # not the owner
    assert r.day_entries("user:1", "2026-06-13")
    assert r.delete_entry("user:1", e["id"]) is True
    assert r.day_entries("user:1", "2026-06-13") == []


def test_profile_defaults_empty_then_upsert():
    r = _repo()
    assert r.get_profile("user:1") == {"sex": None, "age": None, "weight_kg": None,
                                       "activity": None, "goal": None, "target_overrides": {}}
    r.upsert_profile("user:1", {"sex": "m", "target_overrides": {"protein_g": 80}})
    p = r.get_profile("user:1")
    assert p["sex"] == "m" and p["target_overrides"] == {"protein_g": 80}
    r.upsert_profile("user:1", {"target_overrides": {"protein_g": 90}})  # partial update
    assert r.get_profile("user:1")["sex"] == "m"  # unchanged
    assert r.get_profile("user:1")["target_overrides"] == {"protein_g": 90}
```

- [ ] **Step 2: Run to verify it fails**

Run: `backend/.venv/bin/pytest tests/test_diet_repo.py -q`
Expected: FAIL (`ModuleNotFoundError: app.repositories.diet`).

- [ ] **Step 3: Implement**

```python
# app/repositories/diet.py
from sqlalchemy import select
from app.models import FoodLogEntry, Profile
from app.nutrition.targets import MACRO_KEYS

_PROFILE_FIELDS = ("sex", "age", "weight_kg", "activity", "goal")


class DietRepository:
    """Food-log CRUD + per-user profile. All reads/writes are user-scoped by caller."""

    def __init__(self, session_factory):
        self._Session = session_factory

    def _entry_dict(self, e: FoodLogEntry) -> dict:
        return {
            "id": e.id, "day": e.day, "kind": e.kind, "barcode": e.barcode,
            "name": e.name, "brand": e.brand, "quantity_g": e.quantity_g,
            "image_url": e.image_url,
            **{k: getattr(e, k) for k in MACRO_KEYS},
        }

    def add_entry(self, *, identity: str, day: str, kind: str, name: str, brand: str,
                  quantity_g: float, macros: dict, barcode: str | None = None,
                  image_url: str = "") -> dict:
        with self._Session() as s:
            e = FoodLogEntry(
                identity=identity, day=day, kind=kind, name=name, brand=brand,
                quantity_g=float(quantity_g), barcode=barcode, image_url=image_url,
                **{k: float(macros.get(k, 0) or 0) for k in MACRO_KEYS},
            )
            s.add(e)
            s.commit()
            s.refresh(e)
            return self._entry_dict(e)

    def day_entries(self, identity: str, day: str) -> list[dict]:
        with self._Session() as s:
            rows = s.scalars(
                select(FoodLogEntry)
                .where(FoodLogEntry.identity == identity, FoodLogEntry.day == day)
                .order_by(FoodLogEntry.created_at)
            ).all()
            return [self._entry_dict(e) for e in rows]

    def delete_entry(self, identity: str, entry_id: int) -> bool:
        with self._Session() as s:
            e = s.get(FoodLogEntry, entry_id)
            if e is None or e.identity != identity:
                return False
            s.delete(e)
            s.commit()
            return True

    def get_profile(self, identity: str) -> dict:
        with self._Session() as s:
            p = s.get(Profile, identity)
            if p is None:
                return {**{f: None for f in _PROFILE_FIELDS}, "target_overrides": {}}
            return {**{f: getattr(p, f) for f in _PROFILE_FIELDS},
                    "target_overrides": p.target_overrides or {}}

    def upsert_profile(self, identity: str, fields: dict) -> dict:
        with self._Session() as s:
            p = s.get(Profile, identity)
            if p is None:
                p = Profile(identity=identity)
                s.add(p)
            for f in _PROFILE_FIELDS:
                if f in fields:
                    setattr(p, f, fields[f])
            if fields.get("target_overrides") is not None:
                p.target_overrides = fields["target_overrides"]
            s.commit()
        return self.get_profile(identity)
```

- [ ] **Step 4: Run to verify pass**

Run: `backend/.venv/bin/pytest tests/test_diet_repo.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories/diet.py backend/tests/test_diet_repo.py
git commit -m "feat(diet): DietRepository (log CRUD + profile)"
```

---

### Task 4: Schemas, `current_user` guard, and `/diet/log` + `/diet/day` + delete routes

**Files:**
- Modify: `app/schemas.py`
- Modify: `app/main.py` (inside `create_app`, near the scan routes; and `app_from_settings`)
- Test: `tests/test_diet_api.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_diet_api.py
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository
from app.scoring.scorer import score as score_fn


class _OFF:
    def fetch(self, barcode): return None


class _Extractor:
    def extract(self, b): raise RuntimeError("unused")


class _Estimator:
    def estimate(self, image_bytes):
        return {"name": "Dal rice", "portion_g": 350.0,
                "per100g": {"energy_kj": 500, "sugars_g": 2, "sat_fat_g": 1,
                            "salt_g": 0.3, "fibre_g": 2, "protein_g": 4}}


@pytest.fixture
def client_and_sf():
    engine = make_engine("sqlite://")
    sf = make_session_factory(engine)
    init_db(engine)
    # seed one packaged product to log
    repo = ProductRepository(sf)
    nutrition = {"energy_kj": 360, "sugars_g": 14.5, "sat_fat_g": 1.25, "salt_g": 0.075,
                 "fibre_g": 0, "protein_g": 2.1, "fruit_veg_nuts_pct": 0}
    repo.save(barcode="b1", name="Amul Lassi", brand="Amul", category="dairy",
              ingredients=["milk"], nutrition=nutrition,
              score=score_fn(["milk"], nutrition, "dairy"), source="amazon")
    app = create_app(session_factory=sf, off_client=_OFF(), label_extractor=_Extractor(),
                     meal_estimator=_Estimator(), secret="s", guest_limit=3, free_limit=10,
                     today="2026-06-13")
    return TestClient(app), sf


def _guest_token(c):
    return c.post("/auth/guest", json={"device_id": "d1"}).json()["token"]


def _user_headers(secret="s"):
    # forge a 'user:1' token the same way AuthService signs it
    import hmac, hashlib
    payload = "user:1"
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return {"Authorization": f"Bearer {payload}.{sig}"}


def test_diet_requires_signed_in_user(client_and_sf):
    c, _ = client_and_sf
    g = _guest_token(c)
    r = c.get("/diet/day", headers={"Authorization": f"Bearer {g}"})
    assert r.status_code == 401


def test_log_packaged_computes_macros_from_product(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    r = c.post("/diet/log", headers=h, json={"kind": "packaged", "barcode": "b1",
               "name": "Amul Lassi", "brand": "Amul", "quantity_g": 200})
    assert r.status_code == 200
    body = r.json()
    # 14.5g sugar/100g * 200/100 = 29
    assert round(body["entry"]["sugars_g"], 1) == 29.0
    assert body["totals"]["sugars_g"] == body["entry"]["sugars_g"]
    assert body["status"]["sugars_g"] in ("ok", "over")
    assert "headline" in body


def test_log_unpackaged_uses_supplied_per100g_then_day_and_delete(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    per = {"energy_kj": 500, "sugars_g": 2, "sat_fat_g": 1, "salt_g": 0.3, "fibre_g": 2, "protein_g": 4}
    r = c.post("/diet/log", headers=h, json={"kind": "unpackaged", "name": "Dal rice",
               "quantity_g": 350, "per100g": per})
    eid = r.json()["entry"]["id"]
    assert round(r.json()["entry"]["protein_g"], 1) == 14.0  # 4 * 350/100
    day = c.get("/diet/day?date=2026-06-13", headers=h).json()
    assert len(day["entries"]) == 1 and day["targets"]["protein_g"] == 50.0
    d = c.delete(f"/diet/log/{eid}", headers=h)
    assert d.status_code == 200 and d.json()["totals"]["protein_g"] == 0
```

- [ ] **Step 2: Run to verify it fails**

Run: `backend/.venv/bin/pytest tests/test_diet_api.py -q`
Expected: FAIL (`create_app() got an unexpected keyword argument 'meal_estimator'`).

- [ ] **Step 3: Implement — schemas in `app/schemas.py`**

Append (these are pydantic models; match the existing style in the file):
```python
class DietLogRequest(BaseModel):
    kind: str = "packaged"               # packaged | unpackaged | manual
    barcode: str | None = None
    name: str
    brand: str = ""
    quantity_g: float
    per100g: dict | None = None          # required for unpackaged/manual
    image_url: str = ""
    day: str | None = None               # client-local YYYY-MM-DD; defaults to server today


class ProfileRequest(BaseModel):
    sex: str | None = None
    age: int | None = None
    weight_kg: float | None = None
    activity: str | None = None
    goal: str | None = None
    target_overrides: dict | None = None
```
(If `BaseModel` isn't already imported at the top of `schemas.py`, it is — the existing request models use it.)

- [ ] **Step 4: Implement — wire `create_app` in `app/main.py`**

Add imports at the top:
```python
from app.repositories.diet import DietRepository
from app.nutrition.targets import compute_targets, summarize_day, MACRO_KEYS
from app.schemas import DietLogRequest, ProfileRequest
```
Change the `create_app` signature to accept the estimator (add `meal_estimator=None` param):
```python
def create_app(*, session_factory, off_client, label_extractor, meal_estimator=None,
               secret, guest_limit, free_limit, google_client_id="", today=None):
```
Inside `create_app`, after `catalog = ProductRepository(session_factory)` add:
```python
    diet = DietRepository(session_factory)
```
After the `current_identity` function, add the guard + day helper:
```python
    def current_user(identity: dict = Depends(current_identity)) -> dict:
        """Diet tracking is for signed-in users only; reject guest tokens."""
        if identity["tier"] == "guest" or identity["id"].startswith("guest:"):
            raise HTTPException(status_code=401, detail={"error": "sign in to track"})
        return identity

    def _day_payload(identity_id: str, day: str) -> dict:
        entries = diet.day_entries(identity_id, day)
        targets = compute_targets(diet.get_profile(identity_id))
        summary = summarize_day(entries, targets)
        return {"date": day, "entries": entries, "targets": targets,
                "totals": summary["totals"], "status": summary["status"],
                "headline": summary["headline"]}

    def _entry_macros(req: DietLogRequest) -> dict:
        # Packaged: derive per-100g from the stored product. Else: client supplies per100g.
        if req.kind == "packaged" and req.barcode:
            product = catalog.get(req.barcode)
            per100g = (product or {}).get("nutrition", {}) if product else {}
        else:
            per100g = req.per100g or {}
        q = req.quantity_g
        return {k: float(per100g.get(k, 0) or 0) * q / 100.0 for k in MACRO_KEYS}
```
Add the routes (place them after the `/scan/photo` route, before `/catalog/categories`):
```python
    @app.post("/diet/log")
    def diet_log(req: DietLogRequest, identity: dict = Depends(current_user)):
        day = req.day or _today()
        macros = _entry_macros(req)
        entry = diet.add_entry(identity=identity["id"], day=day, kind=req.kind,
                               name=req.name, brand=req.brand, quantity_g=req.quantity_g,
                               macros=macros, barcode=req.barcode, image_url=req.image_url)
        return {"entry": entry, **_day_payload(identity["id"], day)}

    @app.get("/diet/day")
    def diet_day(date: str = "", identity: dict = Depends(current_user)):
        return _day_payload(identity["id"], date or _today())

    @app.delete("/diet/log/{entry_id}")
    def diet_delete(entry_id: int, date: str = "", identity: dict = Depends(current_user)):
        ok = diet.delete_entry(identity["id"], entry_id)
        if not ok:
            raise HTTPException(status_code=404, detail={"error": "entry not found"})
        return {"ok": True, **_day_payload(identity["id"], date or _today())}
```

- [ ] **Step 5: Implement — pass the estimator in `app_from_settings`**

In `app_from_settings`, add a `MealEstimator` import and pass it (the class is built in Task 10; for now import will fail, so define a stub first). **To keep this task green, add the parameter pass-through but guard the import:** change the `create_app(...)` call in `app_from_settings` to include `meal_estimator=None` for now:
```python
        meal_estimator=None,   # replaced in Task 10
```
(Task 10 swaps this for the real `MealEstimator`.)

- [ ] **Step 6: Run to verify pass + full suite**

Run: `backend/.venv/bin/pytest tests/test_diet_api.py -q && backend/.venv/bin/pytest -q`
Expected: diet api PASS (3 tests); full suite still green (existing `create_app` callers use keyword args, and `meal_estimator` defaults to `None`).

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas.py backend/app/main.py backend/tests/test_diet_api.py
git commit -m "feat(diet): current_user guard + /diet/log, /diet/day, delete routes"
```

---

# PHASE 2 — Packaged loop, end-to-end on the frontend (usable after this phase)

### Task 5: Diet API client + types

**Files:**
- Create: `src/api/diet.ts`
- Test: none (thin wrapper; covered via screen tests later)

- [ ] **Step 1: Implement**

```typescript
// src/api/diet.ts
import { fetchJson } from "./client";

export type MacroKey = "energy_kj" | "sugars_g" | "sat_fat_g" | "salt_g" | "fibre_g" | "protein_g";
export type Macros = Record<MacroKey, number>;
export type MacroStatus = "low" | "ok" | "over";

export interface LogEntry {
  id: number; day: string; kind: string; barcode: string | null;
  name: string; brand: string; quantity_g: number; image_url: string;
  energy_kj: number; sugars_g: number; sat_fat_g: number; salt_g: number;
  fibre_g: number; protein_g: number;
}
export interface DietDay {
  date: string; entries: LogEntry[]; targets: Macros; totals: Macros;
  status: Record<MacroKey, MacroStatus>; headline: string;
}
export interface MealEstimate {
  name: string; portion_g: number; per100g: Macros; grade?: string; image_url?: string;
}
export interface LogBody {
  kind: "packaged" | "unpackaged" | "manual";
  barcode?: string | null; name: string; brand?: string;
  quantity_g: number; per100g?: Macros; image_url?: string; day?: string;
}

const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function getDay(token: string, date = localDay()): Promise<DietDay> {
  return fetchJson<DietDay>(`/diet/day?date=${date}`, { token });
}
export function addLog(token: string, body: LogBody): Promise<{ entry: LogEntry } & DietDay> {
  return fetchJson(`/diet/log`, { token, json: { day: localDay(), ...body } });
}
export function deleteLog(token: string, id: number): Promise<{ ok: boolean } & DietDay> {
  return fetchJson(`/diet/log/${id}?date=${localDay()}`, { token, method: "DELETE" });
}
export function estimateMeal(token: string, file: File): Promise<MealEstimate> {
  const fd = new FormData();
  fd.append("image", file);
  return fetchJson<MealEstimate>(`/diet/estimate`, { token, method: "POST", body: fd });
}
export function getProfile(token: string): Promise<{ profile: Record<string, unknown>; effective_targets: Macros }> {
  return fetchJson(`/diet/profile`, { token });
}
export function putProfile(token: string, body: Record<string, unknown>): Promise<{ profile: Record<string, unknown>; effective_targets: Macros }> {
  return fetchJson(`/diet/profile`, { token, json: body });
}
export { localDay };
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/diet.ts
git commit -m "feat(diet): frontend diet API client + types"
```

---

### Task 6: Add "today" tab to nav + TabBar

**Files:**
- Modify: `src/session/nav.ts`
- Modify: `src/components/TabBar.tsx`
- Test: `src/session/nav.test.ts` (extend if exists, else create)

- [ ] **Step 1: Write the failing test**

```typescript
// src/session/nav.test.ts  (add these; keep existing tests if the file exists)
import { describe, it, expect } from "vitest";
import { selectTab, isTabRoot, activeTab } from "./nav";

describe("today tab", () => {
  it("today is a tab root", () => {
    expect(isTabRoot({ t: "today" })).toBe(true);
    expect(activeTab(selectTab([{ t: "home" }], "today"))).toBe("today");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/session/nav.test.ts`
Expected: FAIL (type error / `isTabRoot` false for `today`).

- [ ] **Step 3: Implement — `src/session/nav.ts`**

Add `"today"` to `Tab` and the `Screen` union, plus new screens. Replace the `Tab`/`Screen`/`isTabRoot` declarations:
```typescript
import type { ScanResult, Product } from "../api/types";
import type { MealEstimate } from "../api/diet";

export type Tab = "home" | "explore" | "today" | "history";
export type Screen =
  | { t: "home" } | { t: "explore" } | { t: "history" } | { t: "today" }
  | { t: "category"; category: string }
  | { t: "scan" }
  | { t: "result"; result: ScanResult }
  | { t: "compare"; a: Product; b: Product }
  | { t: "mealCapture" }
  | { t: "confirmMeal"; estimate: MealEstimate | null; imageUrl?: string }
  | { t: "targets" };
```
And update `isTabRoot`:
```typescript
export function isTabRoot(s: Screen): boolean {
  return s.t === "home" || s.t === "explore" || s.t === "history" || s.t === "today";
}
```
(Leave `top`, `activeTab`, `push`, `selectTab`, `pushResultFromScan`, `pop` unchanged.)

- [ ] **Step 4: Implement — `src/components/TabBar.tsx`**

Add the Today tab between explore and history:
```typescript
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "explore", label: "Explore", icon: "🔍" },
  { id: "today", label: "Today", icon: "📊" },
  { id: "history", label: "History", icon: "🕘" },
];
```

- [ ] **Step 5: Run to verify pass**

Run: `cd frontend && npx vitest run src/session/nav.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/session/nav.ts frontend/src/components/TabBar.tsx frontend/src/session/nav.test.ts
git commit -m "feat(diet): add Today tab to nav + tab bar"
```

---

### Task 7: Portion math helper + PortionSheet component

**Files:**
- Create: `src/diet/portion.ts`
- Create: `src/components/PortionSheet.tsx`, `src/components/PortionSheet.module.css`
- Test: `src/diet/portion.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/diet/portion.test.ts
import { describe, it, expect } from "vitest";
import { portionMacros, defaultServingG } from "./portion";

const per100 = { energy_kj: 360, sugars_g: 14.5, sat_fat_g: 1.25, salt_g: 0.075, fibre_g: 0, protein_g: 2.1 };

describe("portionMacros", () => {
  it("scales per-100g by grams", () => {
    const m = portionMacros(per100, 200);
    expect(m.sugars_g).toBeCloseTo(29);
    expect(m.protein_g).toBeCloseTo(4.2);
  });
  it("zero grams -> zero", () => {
    expect(portionMacros(per100, 0).sugars_g).toBe(0);
  });
});

describe("defaultServingG", () => {
  it("uses product serving size when present", () => {
    expect(defaultServingG(30, "chips")).toBe(30);
  });
  it("falls back to a category default", () => {
    expect(defaultServingG(null, "drinks")).toBe(200);
    expect(defaultServingG(undefined, "unknown")).toBe(40);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/diet/portion.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement — `src/diet/portion.ts`**

```typescript
import type { Macros, MacroKey } from "../api/diet";

const KEYS: MacroKey[] = ["energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g"];

export function portionMacros(per100g: Macros, grams: number): Macros {
  const out = {} as Macros;
  for (const k of KEYS) out[k] = (per100g[k] || 0) * grams / 100;
  return out;
}

// Per-category serving fallback (grams) when a product has no serving_size_g.
const CATEGORY_SERVING: Record<string, number> = {
  drinks: 200, "health drinks": 200, dairy: 150, "ice cream": 60,
  chips: 30, namkeen: 30, biscuits: 25, chocolate: 20, bread: 40,
  "breakfast cereal": 40, "noodles & pasta": 70, "spreads & sauces": 15,
  "dry fruits & nuts": 30, "protein bars": 40,
};
export function defaultServingG(servingSizeG: number | null | undefined, category: string): number {
  if (typeof servingSizeG === "number" && servingSizeG > 0) return servingSizeG;
  return CATEGORY_SERVING[category] ?? 40;
}

export function kcal(energyKj: number): number {
  return Math.round(energyKj / 4.184);
}
```

- [ ] **Step 4: Implement — `src/components/PortionSheet.tsx`**

```typescript
import { useState } from "react";
import type { Macros } from "../api/diet";
import { portionMacros, kcal } from "../diet/portion";
import styles from "./PortionSheet.module.css";

export function PortionSheet({
  title, per100g, defaultGrams, onCancel, onConfirm,
}: {
  title: string; per100g: Macros; defaultGrams: number;
  onCancel: () => void; onConfirm: (grams: number) => void;
}) {
  const [grams, setGrams] = useState(Math.round(defaultGrams));
  const m = portionMacros(per100g, grams);
  const mult = (factor: number) => setGrams(Math.round(defaultGrams * factor));
  return (
    <div className={styles.wrap} role="dialog" aria-label="Portion">
      <div className={styles.scrim} onClick={onCancel} />
      <div className={styles.sheet}>
        <div className={styles.grab} />
        <h3 className={styles.h}>How much did you have?</h3>
        <p className={styles.sub}>{title}</p>
        <div className={styles.seg}>
          <button onClick={() => mult(0.5)}>½</button>
          <button className={styles.on} onClick={() => mult(1)}>1 serving</button>
          <button onClick={() => mult(2)}>2</button>
        </div>
        <div className={styles.grams}>
          <input type="number" min={0} value={grams}
            onChange={(e) => setGrams(Math.max(0, Number(e.target.value) || 0))} />
          <span>grams</span>
        </div>
        <div className={styles.preview}>
          <span>This counts</span>
          <b>{kcal(m.energy_kj)} kcal · {m.sugars_g.toFixed(1)}g sugar · {m.protein_g.toFixed(1)}g protein</b>
        </div>
        <button className={styles.add} onClick={() => onConfirm(grams)}>Add to today ✓</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement — `src/components/PortionSheet.module.css`**

```css
.wrap { position: fixed; inset: 0; z-index: 80; display: flex; flex-direction: column; justify-content: flex-end; }
.scrim { position: absolute; inset: 0; background: rgba(8,20,14,.34); }
.sheet { position: relative; background: var(--paper); border-radius: 24px 24px 0 0; padding: 8px 16px 20px; box-shadow: 0 -8px 30px rgba(0,0,0,.18); }
.grab { width: 38px; height: 4px; border-radius: 99px; background: #d9d8cf; margin: 6px auto 12px; }
.h { font-size: 17px; font-weight: 800; }
.sub { font-size: 12.5px; color: var(--muted); margin: 2px 0 14px; }
.seg { display: flex; gap: 8px; margin-bottom: 12px; }
.seg button { flex: 1; padding: 11px 0; border-radius: 13px; background: var(--card); border: 1px solid var(--line); font-size: 14px; font-weight: 700; color: var(--ink); }
.seg button.on { background: var(--green-deep); color: #eafff2; border-color: var(--green-deep); }
.grams { display: flex; align-items: center; gap: 10px; background: var(--card); border: 1px solid var(--line); border-radius: 13px; padding: 11px 13px; margin-bottom: 14px; }
.grams input { flex: 1; border: 0; background: transparent; font-family: inherit; font-size: 15px; font-weight: 700; width: 100%; }
.grams span { color: var(--muted); font-size: 13px; font-weight: 600; }
.preview { display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 12px; color: var(--muted); background: var(--card); border: 1px solid var(--line); border-radius: 13px; padding: 10px 13px; margin-bottom: 14px; }
.preview > span { flex: none; white-space: nowrap; }
.preview b { color: var(--ink); font-size: 13px; text-align: right; }
.add { display: block; width: 100%; padding: 15px; border-radius: 16px; font-size: 15.5px; font-weight: 700; background: var(--lime); color: #16341f; }
```

- [ ] **Step 6: Run to verify pass**

Run: `cd frontend && npx vitest run src/diet/portion.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/diet/portion.ts frontend/src/diet/portion.test.ts frontend/src/components/PortionSheet.tsx frontend/src/components/PortionSheet.module.css
git commit -m "feat(diet): portion math helper + PortionSheet component"
```

---

### Task 8: TodayScreen

**Files:**
- Create: `src/screens/TodayScreen.tsx`, `src/screens/TodayScreen.module.css`
- Test: `src/screens/TodayScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/screens/TodayScreen.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TodayScreen } from "./TodayScreen";
import type { DietDay } from "../api/diet";

const DAY: DietDay = {
  date: "2026-06-13",
  headline: "You're low on fibre & protein, and over on sugar.",
  targets: { energy_kj: 8368, sugars_g: 50, sat_fat_g: 22, salt_g: 5, fibre_g: 30, protein_g: 50 },
  totals: { energy_kj: 6000, sugars_g: 61, sat_fat_g: 14, salt_g: 4.1, fibre_g: 11, protein_g: 38 },
  status: { energy_kj: "ok", sugars_g: "over", sat_fat_g: "ok", salt_g: "ok", fibre_g: "low", protein_g: "low" },
  entries: [{ id: 1, day: "2026-06-13", kind: "packaged", barcode: "b1", name: "Amul Lassi",
              brand: "Amul", quantity_g: 200, image_url: "", energy_kj: 260, sugars_g: 29,
              sat_fat_g: 2, salt_g: 0.1, fibre_g: 0, protein_g: 4.2 }],
};

vi.mock("../api/diet", async (orig) => ({ ...(await orig()), getDay: vi.fn(() => Promise.resolve(DAY)), deleteLog: vi.fn() }));

describe("TodayScreen", () => {
  it("renders headline, a macro row, and a logged entry", async () => {
    render(<TodayScreen token="t" onAddFood={() => {}} onOpenTargets={() => {}} />);
    await waitFor(() => expect(screen.getByText(/over on sugar/i)).toBeInTheDocument());
    expect(screen.getByText("Protein")).toBeInTheDocument();
    expect(screen.getByText("Amul Lassi")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/screens/TodayScreen.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement — `src/screens/TodayScreen.tsx`**

```typescript
import { useEffect, useState } from "react";
import { getDay, deleteLog, type DietDay, type MacroKey } from "../api/diet";
import { kcal } from "../diet/portion";
import styles from "./TodayScreen.module.css";

const ROWS: { key: MacroKey; label: string; unit: string; toDisplay?: (v: number) => number }[] = [
  { key: "energy_kj", label: "Energy", unit: "kcal", toDisplay: kcal },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "fibre_g", label: "Fibre", unit: "g" },
  { key: "sugars_g", label: "Sugar", unit: "g" },
  { key: "sat_fat_g", label: "Sat fat", unit: "g" },
  { key: "salt_g", label: "Salt", unit: "g" },
];

export function TodayScreen({ token, onAddFood, onOpenTargets }: {
  token: string; onAddFood: () => void; onOpenTargets: () => void;
}) {
  const [day, setDay] = useState<DietDay | null>(null);
  useEffect(() => { getDay(token).then(setDay).catch(() => setDay(null)); }, [token]);

  const remove = async (id: number) => {
    try { setDay(await deleteLog(token, id)); } catch { /* ignore */ }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <span className={styles.ttl}>Today</span>
        <button className={styles.gear} onClick={onOpenTargets} aria-label="Targets">⚙︎</button>
      </div>
      {!day && <div className={`skeleton ${styles.skel}`} />}
      {day && (
        <>
          <div className={styles.flag}>
            <div className={styles.k}>Today’s gaps</div>
            <div className={styles.v}>{day.headline}</div>
          </div>
          <div className={styles.card}>
            {ROWS.map((r) => {
              const disp = r.toDisplay ?? ((v: number) => Math.round(v));
              const consumed = disp(day.totals[r.key]);
              const target = disp(day.targets[r.key]);
              const pct = Math.min(100, target ? (day.totals[r.key] / day.targets[r.key]) * 100 : 0);
              const st = day.status[r.key];
              const color = st === "over" ? "var(--red)" : st === "low" ? "var(--amber)" : "var(--green)";
              return (
                <div key={r.key} className={styles.mrow}>
                  <div className={styles.mtop}>
                    <span className={styles.mname}>{r.label}
                      {st !== "ok" && <span className={`${styles.tag} ${styles[st]}`}>{st}</span>}
                    </span>
                    <span className={styles.mval}><b>{consumed}</b> / {target} {r.unit}</span>
                  </div>
                  <div className={styles.bar}><div className={styles.fill} style={{ width: `${pct}%`, background: color }} /></div>
                </div>
              );
            })}
          </div>
          <div className={styles.sec}>Logged today · {day.entries.length}</div>
          {day.entries.map((e) => (
            <div key={e.id} className={styles.item}>
              <div className={styles.thumb}>{e.kind === "packaged" ? "🛒" : "🍽"}</div>
              <div>
                <div className={styles.iname}>{e.name}</div>
                <div className={styles.imeta}>{Math.round(e.quantity_g)}g</div>
              </div>
              <span className={styles.ical}>{kcal(e.energy_kj)}</span>
              <button className={styles.del} onClick={() => remove(e.id)} aria-label="Remove">🗑</button>
            </div>
          ))}
          {day.entries.length === 0 && <div className={styles.empty}>Nothing logged yet.</div>}
          <button className={styles.add} onClick={onAddFood}>＋ Add food</button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement — `src/screens/TodayScreen.module.css`**

```css
.screen { min-height: 100dvh; padding-bottom: 20px; }
.top { display: flex; align-items: center; justify-content: space-between; padding: 30px 18px 8px; }
.ttl { font-size: 22px; font-weight: 800; color: var(--green-deep); }
.gear { width: 32px; height: 32px; border-radius: 50%; background: var(--card); border: 1px solid var(--line); font-size: 15px; }
.skel { height: 320px; margin: 14px 16px; }
.flag { margin: 10px 16px 8px; background: linear-gradient(135deg,#10402f,#0b3d2c); color: #eafff2; border-radius: 18px; padding: 15px 16px; }
.k { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--lime); opacity: .9; }
.v { font-size: 16px; font-weight: 700; margin-top: 4px; line-height: 1.32; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; margin: 6px 14px; padding: 2px 8px; }
.mrow { padding: 11px 8px; border-bottom: 1px solid var(--line); }
.mrow:last-child { border-bottom: 0; }
.mtop { display: flex; justify-content: space-between; align-items: baseline; font-size: 13.5px; }
.mname { font-weight: 700; }
.mval { font-variant-numeric: tabular-nums; color: var(--muted); font-weight: 600; }
.mval b { color: var(--ink); }
.bar { height: 8px; border-radius: 99px; background: var(--line); margin-top: 7px; overflow: hidden; }
.fill { height: 100%; border-radius: 99px; }
.tag { font-size: 10.5px; font-weight: 700; padding: 1px 7px; border-radius: 99px; margin-left: 6px; }
.low { background: #fdeede; color: #a4631a; }
.over { background: #fbe4e1; color: #b53127; }
.sec { font-size: 12px; font-weight: 700; color: var(--muted); letter-spacing: .05em; text-transform: uppercase; margin: 18px 18px 8px; }
.item { display: flex; align-items: center; gap: 11px; margin: 0 14px 9px; background: var(--card); border: 1px solid var(--line); border-radius: 15px; padding: 10px 12px; }
.thumb { width: 38px; height: 38px; border-radius: 10px; background: #eef3ee; display: grid; place-items: center; font-size: 18px; flex: none; }
.iname { font-size: 13.5px; font-weight: 700; }
.imeta { font-size: 11.5px; color: var(--muted); margin-top: 1px; }
.ical { font-size: 12.5px; font-weight: 700; color: var(--green); margin-left: auto; }
.del { background: transparent; color: var(--muted); font-size: 15px; padding-left: 4px; }
.empty { text-align: center; color: var(--muted); font-size: 13px; margin: 8px 16px; }
.add { display: block; width: calc(100% - 32px); margin: 14px 16px; padding: 15px; border-radius: 16px; font-size: 15.5px; font-weight: 700; background: var(--green-deep); color: #eafff2; }
```

- [ ] **Step 5: Run to verify pass**

Run: `cd frontend && npx vitest run src/screens/TodayScreen.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/screens/TodayScreen.tsx frontend/src/screens/TodayScreen.module.css frontend/src/screens/TodayScreen.test.tsx
git commit -m "feat(diet): TodayScreen (day summary + log list)"
```

---

### Task 9: "Add to today" on ResultScreen + wire everything in App.tsx (packaged loop live)

**Files:**
- Modify: `src/screens/ResultScreen.tsx`
- Modify: `src/App.tsx`
- Test: `src/screens/ResultScreen.test.tsx` (extend), `src/App.diet.test.tsx` (create)

- [ ] **Step 1: Write the failing test (ResultScreen shows the button)**

```typescript
// src/screens/ResultScreen.test.tsx  (add this test; keep existing ones)
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultScreen } from "./ResultScreen";
import type { Product } from "../api/types";

const product = {
  barcode: "b1", name: "Amul Lassi", brand: "Amul", category: "dairy", ingredients: ["milk"],
  source: "amazon", image_url: "",
  nutrition: { energy_kj: 360, sugars_g: 14.5, sat_fat_g: 1.25, salt_g: 0.075, fibre_g: 0, protein_g: 2.1, fruit_veg_nuts_pct: 0 },
  score: { overall: 65, grade: "B", verdict: "", positives: [], negatives: [], breakdown: { nutrients: [], india_flags: [] } },
} as unknown as Product;

describe("ResultScreen add-to-today", () => {
  it("shows the button when onAddToday is provided", () => {
    render(<ResultScreen product={product} alternatives={[]} onCompare={() => {}} onScanAgain={() => {}} onAddToday={vi.fn()} />);
    expect(screen.getByRole("button", { name: /add to today/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/screens/ResultScreen.test.tsx`
Expected: FAIL (no "Add to today" button; `onAddToday` not a prop).

- [ ] **Step 3: Implement — `src/screens/ResultScreen.tsx`**

Add `onAddToday?: (product: Product) => void` to the component's props type. Then render the button near the top of the result actions (right under the score/hero). Find where the existing primary action (e.g. "Healthier options" or scan-again) renders and add, guarded so it only appears when the callback is provided:
```typescript
{onAddToday && (
  <button
    type="button"
    onClick={() => onAddToday(product)}
    style={{ display: "block", width: "calc(100% - 32px)", margin: "14px 16px",
      padding: 15, borderRadius: 16, fontSize: 15.5, fontWeight: 700,
      background: "var(--lime)", color: "#16341f", border: 0 }}
  >
    ＋ Add to today
  </button>
)}
```
(If ResultScreen uses a CSS module, prefer adding an `.addToday` class mirroring the inline style; inline is acceptable for v1.)

- [ ] **Step 4: Write the failing test (App renders Today tab + gates guests)**

```typescript
// src/App.diet.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Minimal smoke: the Today tab label appears in the tab bar once a (mocked) session exists.
// SessionProvider reads localStorage; with no token the AuthScreen shows, so we just assert
// the app renders without crashing and the tab list includes Today after sign-in is simulated.
describe("App diet nav", () => {
  it("renders without crashing", () => {
    render(<App />);
    expect(document.body).toBeTruthy();
  });
});
```
*(Keep this smoke test light — full nav integration is covered by `nav.test.ts` and `TodayScreen.test.tsx`. The real wiring is verified manually + by the existing App tests.)*

- [ ] **Step 5: Implement — wire `src/App.tsx`**

Add imports:
```typescript
import { TodayScreen } from "./screens/TodayScreen";
import { PortionSheet } from "./components/PortionSheet";
import { defaultServingG } from "./diet/portion";
import { addLog, type Macros } from "./api/diet";
```
Add local state for the portion sheet inside `Shell` (near the other `useState`s):
```typescript
  const [portionFor, setPortionFor] = useState<Product | null>(null);
```
Add a helper that gates guests and opens the portion sheet, plus the logging call:
```typescript
  const requireUser = (): boolean => {
    if (isGuest) { signOut(); return false; }   // signOut bounces to AuthScreen to sign in
    return true;
  };
  const startAddToday = (product: Product) => { if (requireUser()) setPortionFor(product); };
  const confirmPortion = async (grams: number) => {
    const p = portionFor;
    if (!p || !token) return;
    setPortionFor(null);
    try {
      await addLog(token, { kind: "packaged", barcode: p.barcode, name: p.name,
        brand: p.brand, quantity_g: grams });
      go(selectTab(stack, "today"));
    } catch { /* surfaced on Today refetch */ }
  };
```
Pass `onAddToday={startAddToday}` to the `ResultScreen` in the `cur.t === "result"` branch.
Add the `today` render branch (mirroring the other `tabbed(...)` tabs):
```typescript
  if (cur.t === "today") {
    if (isGuest) { signOut(); return null; }
    return tabbed(
      <TodayScreen token={token}
        onAddFood={() => go(push(stack, { t: "mealCapture" }))}
        onOpenTargets={() => go(push(stack, { t: "targets" }))} />, "light");
  }
```
Render the portion sheet as an overlay (just before the final `return` of `Shell`, or wrap the returned node). Simplest: at the end of the `result` branch return, include it. Since multiple branches return early, add the sheet to the `result` branch return AND the `today` branch by wrapping. **Cleanest:** render it globally by changing the `result` branch to include it; for v1, add it to the `result` branch (the only place "Add to today" originates):
```typescript
  if (cur.t === "result") {
    const r = cur.result;
    return (
      <div style={{ position: "relative", minHeight: "100dvh" }}>
        {profile("dark")}
        <ResultScreen product={r.product} alternatives={r.alternatives ?? []}
          onCompare={(alt) => go(push(stack, { t: "compare", a: r.product, b: alt }))}
          onScanAgain={back} onAddToday={startAddToday} />
        {portionFor && (
          <PortionSheet title={`${portionFor.name} · ${portionFor.brand}`}
            per100g={portionFor.nutrition as unknown as Macros}
            defaultGrams={defaultServingG((portionFor as { serving_size_g?: number }).serving_size_g, portionFor.category ?? "")}
            onCancel={() => setPortionFor(null)} onConfirm={confirmPortion} />
        )}
      </div>
    );
  }
```
(Also add `mealCapture`, `confirmMeal`, `targets` placeholder branches now to avoid a blank screen — they get real bodies in Tasks 11–12. Temporary:)
```typescript
  if (cur.t === "mealCapture" || cur.t === "confirmMeal" || cur.t === "targets") {
    return <div style={{ padding: 40 }}>Coming up next task… <button onClick={back}>Back</button></div>;
  }
```

- [ ] **Step 6: Run tests + typecheck + build**

Run: `cd frontend && npx vitest run src/screens/ResultScreen.test.tsx src/App.diet.test.tsx && npx tsc --noEmit && npm run build`
Expected: PASS + clean build.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/screens/ResultScreen.tsx frontend/src/App.tsx frontend/src/screens/ResultScreen.test.tsx frontend/src/App.diet.test.tsx
git commit -m "feat(diet): Add-to-today button + Today tab wiring (packaged loop live)"
```

> **Checkpoint:** the packaged loop now works end-to-end (scan → Add to today → portion → Today shows it). Deploy/verify before Phase 3 if desired.

---

# PHASE 3 — Meal snap (unpackaged)

### Task 10: MealEstimator + `/diet/estimate`

**Files:**
- Create: `app/services/meal_estimator.py`
- Modify: `app/main.py` (route + inject in `app_from_settings`)
- Test: `tests/test_meal_estimator.py`, extend `tests/test_diet_api.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_meal_estimator.py
import json
from app.services.meal_estimator import MealEstimator, MealEstimateError


class _Resp:
    status_code = 200
    def __init__(self, content): self._c = content
    def json(self): return {"choices": [{"message": {"content": self._c}}]}


def test_parses_estimate(monkeypatch):
    payload = json.dumps({"name": "Dal rice", "portion_g": 350,
        "nutrition": {"energy_kj": 500, "sugars_g": 2, "sat_fat_g": 1, "salt_g": 0.3,
                      "fibre_g": 2, "protein_g": 4}})
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp(payload))
    est = MealEstimator(api_key="k", model="m", url="u").estimate(b"jpegbytes")
    assert est["name"] == "Dal rice" and est["portion_g"] == 350.0
    assert est["per100g"]["protein_g"] == 4.0
    assert set(est["per100g"]) == {"energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g"}


def test_raises_on_bad_json(monkeypatch):
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp("not json"))
    try:
        MealEstimator(api_key="k", model="m", url="u").estimate(b"x")
        assert False
    except MealEstimateError:
        pass
```

- [ ] **Step 2: Run to verify it fails**

Run: `backend/.venv/bin/pytest tests/test_meal_estimator.py -q`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement — `app/services/meal_estimator.py`**

```python
"""Estimate nutrients for an unpackaged meal photo via an OpenRouter vision model.
Mirrors LabelExtractor: returns {name, portion_g, per100g{6 macros}}. The macros are
PER 100 g so the client can re-scale to any confirmed portion."""
import base64
import json
import httpx

_MACRO_KEYS = ("energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g")
_PROMPT = (
    "You are looking at a photo of a prepared/unpackaged meal (often Indian). Return "
    "ONLY a JSON object with keys: name (string, concise dish name), portion_g (number, "
    "your best estimate of the total grams of food shown), and nutrition (object with "
    "numeric PER-100g keys: energy_kj, sugars_g, sat_fat_g, salt_g, fibre_g, protein_g).\n"
    "- energy_kj must be kilojoules (kcal*4.184 if you reason in kcal).\n"
    "- Estimate typical home-cooked values. Use 0 only when truly negligible.\n"
    "No prose, JSON only."
)


class MealEstimateError(Exception):
    """Raised when the vision model output cannot be parsed into a meal estimate."""


def _per100g(n: dict) -> dict:
    g = lambda k: float(n.get(k, 0) or 0)
    return {k: g(k) for k in _MACRO_KEYS}


class MealEstimator:
    def __init__(self, api_key: str, model: str, url: str, timeout: float = 30.0):
        self._api_key = api_key
        self._model = model
        self._url = url
        self._timeout = timeout

    def estimate(self, image_bytes: bytes) -> dict:
        b64 = base64.b64encode(image_bytes).decode("ascii")
        body = {
            "model": self._model,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": _PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ]}],
            "response_format": {"type": "json_object"},
        }
        try:
            resp = httpx.post(self._url, json=body, timeout=self._timeout,
                              headers={"Authorization": f"Bearer {self._api_key}"})
        except httpx.HTTPError as e:
            raise MealEstimateError(str(e)) from e
        if resp.status_code != 200:
            raise MealEstimateError(f"openrouter status {resp.status_code}")
        try:
            content = resp.json()["choices"][0]["message"]["content"]
            data = json.loads(content)
        except (json.JSONDecodeError, KeyError, IndexError, TypeError) as e:
            raise MealEstimateError("model did not return JSON") from e
        if not isinstance(data, dict):
            raise MealEstimateError("model did not return a JSON object")
        return {
            "name": str(data.get("name", "") or "").strip() or "Meal",
            "portion_g": float(data.get("portion_g", 0) or 0) or 200.0,
            "per100g": _per100g(data.get("nutrition", {})),
        }
```

- [ ] **Step 4: Implement — route + scorer grade in `app/main.py`**

Add import:
```python
from app.services.meal_estimator import MealEstimator, MealEstimateError
from app.scoring.scorer import score as score_fn
```
Add the route after `/diet/log` (requires the estimator to be injected; if `meal_estimator` is None, 503):
```python
    @app.post("/diet/estimate")
    async def diet_estimate(image: UploadFile = File(...),
                            identity: dict = Depends(current_user)):
        if meal_estimator is None:
            raise HTTPException(status_code=503, detail={"error": "estimator unavailable"})
        _ensure_quota(identity)
        image_bytes = await image.read()
        try:
            est = meal_estimator.estimate(image_bytes)
        except MealEstimateError:
            raise HTTPException(status_code=422,
                                detail={"error": "could not read the meal, retake photo"})
        scored = score_fn([], {**est["per100g"], "fruit_veg_nuts_pct": 0}, "")
        _consume(identity)
        return {**est, "grade": scored["grade"]}
```
In `app_from_settings`, replace `meal_estimator=None` with a real instance (reusing the OpenRouter creds):
```python
        meal_estimator=MealEstimator(
            api_key=settings.openrouter_api_key, model=settings.vision_model,
            url=settings.openrouter_url),
```

- [ ] **Step 5: Extend `tests/test_diet_api.py`**

```python
def test_estimate_returns_dish_and_per100g(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    r = c.post("/diet/estimate", headers=h,
               files={"image": ("m.jpg", b"jpegbytes", "image/jpeg")})
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Dal rice" and body["per100g"]["protein_g"] == 4
    assert "grade" in body
```

- [ ] **Step 6: Run to verify pass + full suite**

Run: `backend/.venv/bin/pytest tests/test_meal_estimator.py tests/test_diet_api.py -q && backend/.venv/bin/pytest -q`
Expected: PASS; full suite green.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/meal_estimator.py backend/app/main.py backend/tests/test_meal_estimator.py backend/tests/test_diet_api.py
git commit -m "feat(diet): MealEstimator + /diet/estimate endpoint"
```

---

### Task 11: Meal capture + ConfirmMealScreen (+ manual reuse)

**Files:**
- Create: `src/screens/ConfirmMealScreen.tsx`, `src/screens/ConfirmMealScreen.module.css`
- Modify: `src/App.tsx` (replace the placeholder branches; add a capture file input)
- Test: `src/screens/ConfirmMealScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/screens/ConfirmMealScreen.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmMealScreen } from "./ConfirmMealScreen";
import type { MealEstimate } from "../api/diet";

const est: MealEstimate = { name: "Dal rice", portion_g: 350,
  per100g: { energy_kj: 500, sugars_g: 2, sat_fat_g: 1, salt_g: 0.3, fibre_g: 2, protein_g: 4 } };

describe("ConfirmMealScreen", () => {
  it("prefills name + portion and confirms with edited values", () => {
    const onConfirm = vi.fn();
    render(<ConfirmMealScreen estimate={est} onConfirm={onConfirm} onBack={() => {}} />);
    const name = screen.getByDisplayValue("Dal rice") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Dal chawal" } });
    fireEvent.click(screen.getByRole("button", { name: /add to today/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ name: "Dal chawal", quantity_g: 350 }));
  });

  it("works blank for manual entry", () => {
    render(<ConfirmMealScreen estimate={null} onConfirm={() => {}} onBack={() => {}} />);
    expect(screen.getByPlaceholderText(/dish name/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/screens/ConfirmMealScreen.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement — `src/screens/ConfirmMealScreen.tsx`**

```typescript
import { useState } from "react";
import type { MealEstimate, Macros, LogBody } from "../api/diet";
import { portionMacros, kcal } from "../diet/portion";
import styles from "./ConfirmMealScreen.module.css";

const BLANK: Macros = { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0 };

export function ConfirmMealScreen({ estimate, imageUrl, onConfirm, onBack }: {
  estimate: MealEstimate | null; imageUrl?: string;
  onConfirm: (body: LogBody) => void; onBack: () => void;
}) {
  const [name, setName] = useState(estimate?.name ?? "");
  const [grams, setGrams] = useState(Math.round(estimate?.portion_g ?? 100));
  const per100 = estimate?.per100g ?? BLANK;
  const m = portionMacros(per100, grams);
  const base = estimate?.portion_g || 100;
  const submit = () => onConfirm({
    kind: estimate ? "unpackaged" : "manual",
    name: name.trim() || "Meal", quantity_g: grams, per100g: per100, image_url: imageUrl,
  });
  return (
    <div className={styles.screen}>
      <div className={styles.top}><button className={styles.back} onClick={onBack} aria-label="Back">←</button><span>Confirm meal</span><span /></div>
      <div className={styles.card}>
        {imageUrl ? <img className={styles.photo} src={imageUrl} alt="" /> : <div className={styles.photo}>🍽</div>}
        <div className={styles.body}>
          <input className={styles.name} value={name} placeholder="Dish name"
            onChange={(e) => setName(e.target.value)} />
          <div className={styles.hint}>✏︎ Check the name &amp; portion</div>
        </div>
      </div>
      <div className={styles.label}>Portion</div>
      <div className={styles.seg}>
        <button onClick={() => setGrams(Math.round(base * 0.5))}>Small</button>
        <button className={styles.on} onClick={() => setGrams(Math.round(base))}>1 plate</button>
        <button onClick={() => setGrams(Math.round(base * 1.5))}>Large</button>
      </div>
      <div className={styles.grams}>
        <input type="number" min={0} value={grams}
          onChange={(e) => setGrams(Math.max(0, Number(e.target.value) || 0))} />
        <span>grams</span>
      </div>
      <div className={styles.preview}><span>Counts</span>
        <b>{kcal(m.energy_kj)} kcal · {m.sugars_g.toFixed(1)}g sugar · {m.protein_g.toFixed(1)}g protein</b></div>
      <button className={styles.add} onClick={submit}>Add to today ✓</button>
    </div>
  );
}
```

- [ ] **Step 4: Implement — `src/screens/ConfirmMealScreen.module.css`**

```css
.screen { min-height: 100dvh; padding-bottom: 24px; }
.top { display: flex; align-items: center; justify-content: space-between; padding: 30px 18px 8px; font-size: 13px; color: var(--muted); }
.back { background: transparent; font-size: 20px; color: var(--ink); }
.card { margin: 12px 16px; background: var(--card); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
.photo { height: 130px; width: 100%; object-fit: cover; background: linear-gradient(135deg,#dfe9dd,#cfe0d2); display: grid; place-items: center; font-size: 44px; }
.body { padding: 14px; }
.name { width: 100%; border: 1px dashed var(--line); border-radius: 12px; padding: 10px 12px; font-family: inherit; font-size: 15px; font-weight: 700; }
.hint { font-size: 11px; color: #a4631a; margin-top: 8px; }
.label { font-size: 12px; font-weight: 700; color: var(--ink); margin: 14px 18px 8px; }
.seg { display: flex; gap: 8px; margin: 0 16px 12px; }
.seg button { flex: 1; padding: 11px 0; border-radius: 13px; background: var(--card); border: 1px solid var(--line); font-size: 14px; font-weight: 700; color: var(--ink); }
.seg button.on { background: var(--green-deep); color: #eafff2; border-color: var(--green-deep); }
.grams { display: flex; align-items: center; gap: 10px; margin: 0 16px 14px; background: var(--card); border: 1px solid var(--line); border-radius: 13px; padding: 11px 13px; }
.grams input { flex: 1; border: 0; background: transparent; font-family: inherit; font-size: 15px; font-weight: 700; width: 100%; }
.grams span { color: var(--muted); font-size: 13px; font-weight: 600; }
.preview { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0 16px 14px; font-size: 12px; color: var(--muted); background: var(--card); border: 1px solid var(--line); border-radius: 13px; padding: 10px 13px; }
.preview > span { flex: none; white-space: nowrap; }
.preview b { color: var(--ink); font-size: 13px; text-align: right; }
.add { display: block; width: calc(100% - 32px); margin: 0 16px; padding: 15px; border-radius: 16px; font-size: 15.5px; font-weight: 700; background: var(--lime); color: #16341f; }
```

- [ ] **Step 5: Implement — replace App.tsx placeholders**

Add imports:
```typescript
import { ConfirmMealScreen } from "./screens/ConfirmMealScreen";
import { estimateMeal, type MealEstimate, type LogBody } from "./api/diet";
```
Add state:
```typescript
  const [estimate, setEstimate] = useState<MealEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
```
Replace the temporary `mealCapture | confirmMeal | targets` placeholder branch with real `mealCapture` and `confirmMeal` branches (keep `targets` placeholder until Task 12):
```typescript
  if (cur.t === "mealCapture") {
    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !token) return;
      setEstimating(true);
      try {
        const est = await estimateMeal(token, file);
        setEstimate(est);
        go(push(stack.slice(0, -1), { t: "confirmMeal", estimate: est }), "replace");
      } catch {
        // fall back to manual entry on failure
        setEstimate(null);
        go(push(stack.slice(0, -1), { t: "confirmMeal", estimate: null }), "replace");
      } finally { setEstimating(false); }
    };
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", gap: 16, padding: 24 }}>
        <p style={{ color: "var(--muted)" }}>{estimating ? "Reading your meal…" : "Snap or choose a photo of your meal"}</p>
        <label style={{ background: "var(--lime)", color: "#16341f", padding: "14px 22px", borderRadius: 16, fontWeight: 700 }}>
          📷 Take / choose photo
          <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onFile} />
        </label>
        <button onClick={() => go(push(stack.slice(0, -1), { t: "confirmMeal", estimate: null }))}
          style={{ background: "transparent", color: "var(--muted)" }}>or enter manually</button>
        <button onClick={back} style={{ background: "transparent", color: "var(--muted)" }}>Cancel</button>
      </div>
    );
  }
  if (cur.t === "confirmMeal") {
    const logMeal = async (body: LogBody) => {
      if (!token) return;
      try { await addLog(token, body); go(selectTab(stack, "today")); } catch { /* refetch shows truth */ }
    };
    return <ConfirmMealScreen estimate={cur.estimate} imageUrl={cur.imageUrl}
      onConfirm={logMeal} onBack={back} />;
  }
```
*(Note: `estimate`/`setEstimate` state is optional given the estimate is carried on the `confirmMeal` screen object; you may drop the `estimate` state var if unused — keep `estimating` for the capture spinner.)*

- [ ] **Step 6: Run tests + build**

Run: `cd frontend && npx vitest run src/screens/ConfirmMealScreen.test.tsx && npx tsc --noEmit && npm run build`
Expected: PASS + clean build.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/screens/ConfirmMealScreen.tsx frontend/src/screens/ConfirmMealScreen.module.css frontend/src/screens/ConfirmMealScreen.test.tsx frontend/src/App.tsx
git commit -m "feat(diet): meal capture + ConfirmMealScreen (snap & manual)"
```

---

# PHASE 4 — Targets settings

### Task 12: `/diet/profile` routes + TargetsScreen

**Files:**
- Modify: `app/main.py` (two routes)
- Create: `src/screens/TargetsScreen.tsx`, `src/screens/TargetsScreen.module.css`
- Modify: `src/App.tsx` (replace `targets` placeholder)
- Test: extend `tests/test_diet_api.py`; `src/screens/TargetsScreen.test.tsx`

- [ ] **Step 1: Write the failing backend test**

```python
# add to tests/test_diet_api.py
def test_profile_get_then_override_changes_targets(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    r0 = c.get("/diet/profile", headers=h).json()
    assert r0["effective_targets"]["protein_g"] == 50.0
    c.put("/diet/profile", headers=h, json={"target_overrides": {"protein_g": 90}})
    r1 = c.get("/diet/profile", headers=h).json()
    assert r1["effective_targets"]["protein_g"] == 90.0
    assert c.get("/diet/day?date=2026-06-13", headers=h).json()["targets"]["protein_g"] == 90.0
```

- [ ] **Step 2: Run to verify it fails**

Run: `backend/.venv/bin/pytest tests/test_diet_api.py::test_profile_get_then_override_changes_targets -q`
Expected: FAIL (404, route missing).

- [ ] **Step 3: Implement — routes in `app/main.py`**

```python
    @app.get("/diet/profile")
    def diet_get_profile(identity: dict = Depends(current_user)):
        profile = diet.get_profile(identity["id"])
        return {"profile": profile, "effective_targets": compute_targets(profile)}

    @app.put("/diet/profile")
    def diet_put_profile(req: ProfileRequest, identity: dict = Depends(current_user)):
        profile = diet.upsert_profile(identity["id"], req.model_dump(exclude_unset=True))
        return {"profile": profile, "effective_targets": compute_targets(profile)}
```

- [ ] **Step 4: Run backend pass**

Run: `backend/.venv/bin/pytest tests/test_diet_api.py -q`
Expected: PASS.

- [ ] **Step 5: Write the failing frontend test**

```typescript
// src/screens/TargetsScreen.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TargetsScreen } from "./TargetsScreen";

vi.mock("../api/diet", async (orig) => ({
  ...(await orig()),
  getProfile: vi.fn(() => Promise.resolve({ profile: { target_overrides: {} },
    effective_targets: { energy_kj: 8368, sugars_g: 50, sat_fat_g: 22, salt_g: 5, fibre_g: 30, protein_g: 50 } })),
  putProfile: vi.fn(() => Promise.resolve({ profile: {}, effective_targets: {} as never })),
}));

describe("TargetsScreen", () => {
  it("loads current targets and saves an override", async () => {
    const { putProfile } = await import("../api/diet");
    render(<TargetsScreen token="t" onBack={() => {}} />);
    await waitFor(() => expect(screen.getByDisplayValue("50")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(putProfile).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Implement — `src/screens/TargetsScreen.tsx`**

```typescript
import { useEffect, useState } from "react";
import { getProfile, putProfile, type Macros, type MacroKey } from "../api/diet";
import { kcal } from "../diet/portion";
import styles from "./TargetsScreen.module.css";

const FIELDS: { key: MacroKey; label: string; unit: string }[] = [
  { key: "energy_kj", label: "Energy", unit: "kcal" },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "fibre_g", label: "Fibre", unit: "g" },
  { key: "sugars_g", label: "Sugar", unit: "g" },
  { key: "sat_fat_g", label: "Sat fat", unit: "g" },
  { key: "salt_g", label: "Salt", unit: "g" },
];

export function TargetsScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const [vals, setVals] = useState<Record<MacroKey, number> | null>(null);
  useEffect(() => {
    getProfile(token).then((r) => {
      const t = r.effective_targets;
      setVals({ ...t, energy_kj: kcal(t.energy_kj) });   // show energy as kcal
    }).catch(() => setVals(null));
  }, [token]);

  const save = async () => {
    if (!vals) return;
    const overrides: Partial<Macros> = {};
    for (const f of FIELDS) {
      overrides[f.key] = f.key === "energy_kj" ? vals.energy_kj * 4.184 : vals[f.key];
    }
    try { await putProfile(token, { target_overrides: overrides }); onBack(); } catch { /* ignore */ }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.top}><button className={styles.back} onClick={onBack} aria-label="Back">←</button><span>Daily targets</span><span /></div>
      <p className={styles.note}>Smart defaults are set for you. Adjust any to personalise.</p>
      {vals && FIELDS.map((f) => (
        <div key={f.key} className={styles.row}>
          <span className={styles.lbl}>{f.label}</span>
          <input type="number" min={0} value={Math.round(vals[f.key])}
            onChange={(e) => setVals({ ...vals, [f.key]: Math.max(0, Number(e.target.value) || 0) })} />
          <span className={styles.unit}>{f.unit}</span>
        </div>
      ))}
      <button className={styles.save} onClick={save}>Save targets</button>
    </div>
  );
}
```

- [ ] **Step 7: Implement — `src/screens/TargetsScreen.module.css`**

```css
.screen { min-height: 100dvh; padding-bottom: 24px; }
.top { display: flex; align-items: center; justify-content: space-between; padding: 30px 18px 8px; font-size: 13px; color: var(--muted); }
.back { background: transparent; font-size: 20px; color: var(--ink); }
.note { font-size: 12.5px; color: var(--muted); margin: 6px 18px 14px; }
.row { display: flex; align-items: center; gap: 12px; margin: 0 16px 10px; background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
.lbl { font-weight: 700; font-size: 14px; flex: 1; }
.row input { width: 84px; text-align: right; border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; font-family: inherit; font-size: 15px; font-weight: 700; }
.unit { color: var(--muted); font-size: 13px; width: 34px; }
.save { display: block; width: calc(100% - 32px); margin: 16px; padding: 15px; border-radius: 16px; font-size: 15.5px; font-weight: 700; background: var(--green-deep); color: #eafff2; }
```

- [ ] **Step 8: Implement — replace the `targets` placeholder in `src/App.tsx`**

```typescript
import { TargetsScreen } from "./screens/TargetsScreen";
// ...
  if (cur.t === "targets") {
    if (!token) return null;
    return <TargetsScreen token={token} onBack={back} />;
  }
```
(Remove `targets` from the temporary placeholder branch so this real branch is reached.)

- [ ] **Step 9: Run tests + build**

Run: `cd frontend && npx vitest run src/screens/TargetsScreen.test.tsx && npx tsc --noEmit && npm run build && backend/.venv/bin/pytest -q`
Expected: PASS + clean build + backend green.

- [ ] **Step 10: Commit**

```bash
git add backend/app/main.py backend/tests/test_diet_api.py frontend/src/screens/TargetsScreen.tsx frontend/src/screens/TargetsScreen.module.css frontend/src/screens/TargetsScreen.test.tsx frontend/src/App.tsx
git commit -m "feat(diet): /diet/profile + TargetsScreen (editable targets)"
```

---

# PHASE 5 — Serving size (better portion defaults)

### Task 13: Parse OpenFoodFacts serving size → grams

**Files:**
- Modify: `app/clients/openfoodfacts.py`
- Modify: `app/services/scan.py` (persist serving size on cache) — only if needed
- Test: `tests/test_openfoodfacts.py` (extend)

- [ ] **Step 1: Write the failing test**

```python
# add to tests/test_openfoodfacts.py
from app.clients.openfoodfacts import _serving_grams

def test_serving_grams_parses_g_and_ml():
    assert _serving_grams("30 g") == 30.0
    assert _serving_grams("200ml") == 200.0
    assert _serving_grams("1 biscuit (12.5 g)") == 12.5
    assert _serving_grams("") is None
    assert _serving_grams("a handful") is None
```

- [ ] **Step 2: Run to verify it fails**

Run: `backend/.venv/bin/pytest tests/test_openfoodfacts.py::test_serving_grams_parses_g_and_ml -q`
Expected: FAIL (`_serving_grams` missing).

- [ ] **Step 3: Implement — `app/clients/openfoodfacts.py`**

Add a parser and include it in the returned dict. Add at module level:
```python
import re

def _serving_grams(serving_size: str):
    """Pull a gram/ml quantity out of an OFF serving_size string. Returns float or None."""
    if not serving_size:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*(g|ml)\b", str(serving_size).lower())
    return float(m.group(1)) if m else None
```
In `OpenFoodFactsClient.fetch`, add `serving_size_g` to the returned dict:
```python
        return {
            "name": p.get("product_name", "") or "",
            "brand": (p.get("brands", "") or "").split(",")[0].strip(),
            "category": _main_category(p),
            "ingredients": _split_ingredients(p.get("ingredients_text", "")),
            "nutrition": nutrition,
            "image_url": _image_url(p),
            "serving_size_g": _serving_grams(p.get("serving_size", "")),
        }
```

- [ ] **Step 4: Thread serving size into the saved product (scan.py)**

In `ScanService._score_and_cache`, pass it through to `repo.save`. Since `repo.save` does not yet accept `serving_size_g`, add an optional param to `ProductRepository.save` and set it:
```python
# app/repositories/products.py — add param to save(...) signature:
             image_url: str = "", embedding: list | None = None,
             serving_size_g: float | None = None) -> None:
# ...inside, after p.image_url = image_url:
            if serving_size_g is not None:
                p.serving_size_g = serving_size_g
```
And in `scan.py` `_score_and_cache`, pass `serving_size_g=data.get("serving_size_g")` (OFF provides it; photo/extractor data simply omit it → None → unchanged).

Expose `serving_size_g` in `ProductRepository._to_dict` so the frontend receives it:
```python
            "serving_size_g": p.serving_size_g,
```
Add `serving_size_g?: number | null` to the frontend `Product` interface in `src/api/types.ts`.

- [ ] **Step 5: Run to verify pass + full suites**

Run: `backend/.venv/bin/pytest -q && cd frontend && npx tsc --noEmit && npm run build`
Expected: backend green; frontend type-checks + builds.

- [ ] **Step 6: Commit**

```bash
git add backend/app/clients/openfoodfacts.py backend/app/repositories/products.py backend/app/services/scan.py backend/tests/test_openfoodfacts.py frontend/src/api/types.ts
git commit -m "feat(diet): parse OFF serving size -> better portion defaults"
```

---

## Final verification (after all tasks)

- [ ] `backend/.venv/bin/pytest -q` — all green.
- [ ] `cd frontend && npx vitest run && npx tsc --noEmit && npm run build` — all green + clean build.
- [ ] Deploy: commit pushed → `ssh ssh-social 'cd ~/parakh && git pull && cd backend && docker compose up -d --build --force-recreate'`; Vercel auto-deploys the frontend.
- [ ] Live smoke (signed in): scan a barcode → **Add to today** → portion → **Today** shows it with correct macros; **Snap a meal** → confirm → logged; **⚙︎ → targets** override changes the bars; guest tapping **Today** is bounced to sign-in.

---

## Notes for the implementer
- **DRY:** macro keys live in one place each side (`MACRO_KEYS` in `targets.py`; the `MacroKey` type in `diet.ts`). Don't duplicate the list elsewhere.
- **YAGNI:** no multi-day history, charts, streaks, or micronutrients in v1 — do not add them.
- **Auth gating** reuses the existing pattern: guests have `isGuest === true` on the frontend and `tier === "guest"` on the backend; both reject diet access (frontend bounces to AuthScreen via `signOut()`; backend returns 401).
- **Quota:** `/diet/estimate` consumes the existing scan quota (`_ensure_quota` + `_consume`); `/diet/log` does not (logging a known product is free).
