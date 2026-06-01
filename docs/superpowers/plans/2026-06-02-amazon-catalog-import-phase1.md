# Amazon Catalog Import (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the scraped Amazon-India catalog (344 products) into Parakh — extract nutrition/ingredients from label images, decode real barcodes where possible, score with the existing scorer, store with a display image — and surface product images on scans.

**Architecture:** Two parts. **Part B (shipped code, Tasks 1–8):** a new `image_url` column, an alternatives duplicate-guard, OFF image capture, a deterministic `seed_catalog.py`, image rendering on the result screen, and pure build-helper functions. **Part A (one-time build, Tasks 9–10):** `zxing-cpp` decodes barcodes and a Workflow fans out subagents to read label images, producing a committed `catalog_extracted.json` that the seeder loads. Tasks 11–12 verify and deploy.

**Tech Stack:** FastAPI + SQLAlchemy + SQLite (backend, `backend/.venv`, pytest); React + TS + Vite + Vitest (frontend). `zxing-cpp` + `pillow` (build-only, local). The Workflow tool + Claude subagents for extraction.

**Spec:** `docs/superpowers/specs/2026-06-02-amazon-catalog-import-design.md`

---

## File Structure

**Backend (modify):**
- `app/models.py` — add `Product.image_url`.
- `app/db.py` — add `products.image_url` to `_ADDED_COLUMNS`.
- `app/repositories/products.py` — `save(image_url=...)`, `_to_dict` image_url, module-level `_norm_key`, `find_better_in_category(exclude_name_brand=...)`.
- `app/clients/openfoodfacts.py` — return `image_url`.
- `app/services/scan.py` — thread `image_url`, pass `exclude_name_brand` to alternatives.

**Backend (create):**
- `scripts/catalog_build.py` — pure build helpers (filter/clean/map/validate/pick/assemble).
- `scripts/seed_catalog.py` — seeder that loads `catalog_extracted.json`.
- `scripts/catalog_extracted.json` — committed extracted data (produced in Task 9).
- `scripts/catalog_skipped.json` — committed skip report (produced in Task 9).
- `tests/test_catalog_build.py`, `tests/test_seed_catalog.py` — tests.

**Frontend (modify):**
- `src/api/types.ts` — `Source` adds `"amazon"`; `Product.image_url?`.
- `src/screens/ResultScreen.tsx` + `.module.css` — product image + alternative thumbnails.
- `src/screens/ResultScreen.test.tsx` — image render test.

**Conventions:** backend tests from `backend/` via `.venv/bin/pytest`; frontend from `frontend/` via `npm test`, build `npm run build`.

---

## Task 1: Add `image_url` to the Product model

**Files:**
- Modify: `backend/app/models.py:11-23`
- Modify: `backend/app/db.py:13-21`
- Test: `backend/tests/test_db.py`

- [ ] **Step 1: Write the failing migration test**

Append to `backend/tests/test_db.py`:

```python
def test_products_table_gets_image_url_on_existing_db():
    from sqlalchemy import text, inspect
    from app.db import make_engine, init_db
    engine = make_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE products (barcode VARCHAR PRIMARY KEY, name VARCHAR, "
            "brand VARCHAR, ingredients JSON, nutrition JSON, score_overall INTEGER, "
            "score_grade VARCHAR, score_json JSON, source VARCHAR, created_at DATETIME)"
        ))
    init_db(engine)
    cols = {c["name"] for c in inspect(engine).get_columns("products")}
    assert "image_url" in cols
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `.venv/bin/pytest tests/test_db.py::test_products_table_gets_image_url_on_existing_db -v`
Expected: FAIL — `image_url` missing.

- [ ] **Step 3: Add the column to the model**

In `backend/app/models.py`, in the `Product` class, add the field right after the `source` column (line 22):

```python
    source: Mapped[str] = mapped_column(String, default="db")  # db|off|photo|amazon
    image_url: Mapped[str] = mapped_column(String, default="")  # front/display image
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
```

- [ ] **Step 4: Add the migration entry**

In `backend/app/db.py`, extend the `products` dict inside `_ADDED_COLUMNS`:

```python
_ADDED_COLUMNS: dict[str, dict[str, str]] = {
    "products": {"category": "VARCHAR DEFAULT ''", "image_url": "VARCHAR DEFAULT ''"},
    "users": {
        "google_id": "VARCHAR",
        "display_name": "VARCHAR",
        "avatar_url": "VARCHAR",
    },
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `backend/`): `.venv/bin/pytest tests/test_db.py -v`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/app/db.py backend/tests/test_db.py
git commit -m "feat: add Product.image_url with migration"
```

---

## Task 2: Repository — persist & return `image_url`

**Files:**
- Modify: `backend/app/repositories/products.py:16-33,62-70`
- Test: `backend/tests/test_products_repo.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_products_repo.py`:

```python
def test_image_url_roundtrips(repo):
    repo.save(barcode="111", name="Chana", brand="Tata", ingredients=["chana"],
              nutrition={"sugars_g": 1.0},
              score={"overall": 84, "grade": "A", "breakdown": {}}, source="amazon",
              image_url="https://example.com/front.jpg")
    p = repo.get("111")
    assert p["image_url"] == "https://example.com/front.jpg"


def test_image_url_defaults_empty_when_omitted(repo):
    repo.save(barcode="222", name="X", brand="B", ingredients=[], nutrition={},
              score={"overall": 10, "grade": "E", "breakdown": {}}, source="off")
    assert repo.get("222")["image_url"] == ""
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `.venv/bin/pytest tests/test_products_repo.py::test_image_url_roundtrips -v`
Expected: FAIL — `save()` has no `image_url`; `_to_dict` has no `image_url`.

- [ ] **Step 3: Add `image_url` to `save` and `_to_dict`**

In `backend/app/repositories/products.py`, change the `save` signature and body:

```python
    def save(self, *, barcode: str, name: str, brand: str,
             ingredients: list, nutrition: dict, score: dict, source: str,
             category: str = "", image_url: str = "") -> None:
        with self._Session() as s:
            p = s.get(Product, barcode)
            if p is None:
                p = Product(barcode=barcode)
                s.add(p)
            p.name = name
            p.brand = brand
            p.category = category
            p.ingredients = ingredients
            p.nutrition = nutrition
            p.score_overall = score["overall"]
            p.score_grade = score["grade"]
            p.score_json = score
            p.source = source
            p.image_url = image_url
            s.commit()
```

And add `image_url` to `_to_dict`:

```python
    @staticmethod
    def _to_dict(p: Product) -> dict:
        return {
            "barcode": p.barcode, "name": p.name, "brand": p.brand,
            "category": p.category,
            "ingredients": p.ingredients, "nutrition": p.nutrition,
            "score": p.score_json,
            "source": p.source,
            "image_url": p.image_url,
        }
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `backend/`): `.venv/bin/pytest tests/test_products_repo.py -v`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories/products.py backend/tests/test_products_repo.py
git commit -m "feat: persist and return image_url in ProductRepository"
```

---

## Task 3: Repository — alternatives duplicate guard

**Files:**
- Modify: `backend/app/repositories/products.py:1-3,35-60`
- Test: `backend/tests/test_products_repo.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_products_repo.py`:

```python
def test_norm_key_normalizes_case_and_space():
    from app.repositories.products import _norm_key
    assert _norm_key("Amul  Dark", "  Amul ") == _norm_key("amul dark", "amul")


def test_find_better_excludes_same_name_brand_twin(repo):
    # A duplicate of the scanned product (same name+brand) stored under a DIFFERENT
    # barcode must NOT be offered as its own healthier option.
    _save(repo, "scan", "chocolate", 40, grade="C")
    repo.save(barcode="amazon:Z", name="Pscan", brand="B", category="chocolate",
              ingredients=[], nutrition={"sugars_g": 1.0},
              score={"overall": 95, "grade": "A", "breakdown": {}}, source="amazon")
    _save(repo, "real", "chocolate", 90, grade="A")  # a genuinely different A
    out = repo.find_better_in_category(
        category="chocolate", min_overall=40, exclude_barcode="scan",
        better_than_grade="C", exclude_name_brand=_nk("Pscan", "B"))
    bcs = [p["barcode"] for p in out]
    assert "amazon:Z" not in bcs   # same name+brand twin dropped
    assert "real" in bcs           # real alternative kept
```

Add this import + helper near the top of `backend/tests/test_products_repo.py` (after the existing imports):

```python
from app.repositories.products import _norm_key as _nk
```

(Note: `_save` already exists in this file and stores `name=f"P{barcode}"`, so the scanned row `scan` has name `Pscan`, brand `B` — matching the twin above.)

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `.venv/bin/pytest tests/test_products_repo.py::test_find_better_excludes_same_name_brand_twin -v`
Expected: FAIL — `_norm_key` doesn't exist / `exclude_name_brand` is not a parameter.

- [ ] **Step 3: Add `_norm_key` and the filter**

In `backend/app/repositories/products.py`, change the imports at the top:

```python
import re
from sqlalchemy import select
from app.models import Product


def _norm_key(name: str, brand: str) -> str:
    """Normalized identity for dedup: lowercased, whitespace-collapsed 'name|brand'."""
    return re.sub(r"\s+", " ", f"{name}|{brand}".lower()).strip()
```

Replace the whole `find_better_in_category` method with (adds `exclude_name_brand`, drops the SQL `.limit` so we can filter then trim — category pools are small):

```python
    def find_better_in_category(self, *, category: str, min_overall: int,
                                exclude_barcode: str, limit: int = 3,
                                better_than_grade: str = "",
                                exclude_name_brand: str = "") -> list[dict]:
        """Healthier alternatives in the same category, best first.

        A suggestion must be MEANINGFULLY better — a better grade letter, not just a
        couple more points. When `better_than_grade` is given we require the candidate's
        grade to be strictly better; we always also require a higher score as a tie-break
        floor. `exclude_name_brand` (a `_norm_key`) drops a duplicate of the scanned
        product stored under a different barcode, so a product is never its own option.
        An empty category never matches."""
        if not category:
            return []
        _GRADE_FLOOR = {"E": 20, "D": 40, "C": 60, "B": 80, "A": 101}
        floor = max(min_overall + 1, _GRADE_FLOOR.get(better_than_grade.upper(), min_overall + 1))
        with self._Session() as s:
            rows = s.scalars(
                select(Product)
                .where(Product.category == category)
                .where(Product.score_overall >= floor)
                .where(Product.barcode != exclude_barcode)
                .order_by(Product.score_overall.desc())
            ).all()
        out: list[dict] = []
        for p in rows:
            if exclude_name_brand and _norm_key(p.name, p.brand) == exclude_name_brand:
                continue
            out.append(self._to_dict(p))
            if len(out) >= limit:
                break
        return out
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `backend/`): `.venv/bin/pytest tests/test_products_repo.py -v`
Expected: PASS (all — existing limit/grade tests still hold; new dedup test passes).

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories/products.py backend/tests/test_products_repo.py
git commit -m "feat: alternatives duplicate guard via _norm_key/exclude_name_brand"
```

---

## Task 4: Open Food Facts — return a front image URL

**Files:**
- Modify: `backend/app/clients/openfoodfacts.py:60-66`
- Test: `backend/tests/test_openfoodfacts.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_openfoodfacts.py`:

```python
@respx.mock
def test_fetch_returns_front_image_url():
    respx.get(URL).mock(return_value=httpx.Response(200, json={
        "status": 1,
        "product": {
            "product_name": "Chana", "brands": "Tata",
            "ingredients_text": "Chickpeas",
            "image_front_url": "https://img.off/front.jpg",
            "nutriments": {"sugars_100g": 2},
        },
    }))
    assert OpenFoodFactsClient().fetch("111")["image_url"] == "https://img.off/front.jpg"


@respx.mock
def test_fetch_image_url_empty_when_absent():
    respx.get(URL).mock(return_value=httpx.Response(200, json={
        "status": 1,
        "product": {"product_name": "X", "brands": "Y",
                    "ingredients_text": "Potato", "nutriments": {"sugars_100g": 1}},
    }))
    assert OpenFoodFactsClient().fetch("111")["image_url"] == ""
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `.venv/bin/pytest tests/test_openfoodfacts.py::test_fetch_returns_front_image_url -v`
Expected: FAIL — returned dict has no `image_url`.

- [ ] **Step 3: Add `image_url` to the normalized dict**

In `backend/app/clients/openfoodfacts.py`, add a helper above the class (after `_map_nutrition`):

```python
def _image_url(p: dict) -> str:
    return (p.get("image_front_url") or p.get("image_url") or "").strip()
```

And add the field to the returned dict in `fetch`:

```python
        return {
            "name": p.get("product_name", "") or "",
            "brand": (p.get("brands", "") or "").split(",")[0].strip(),
            "category": _main_category(p),
            "ingredients": _split_ingredients(p.get("ingredients_text", "")),
            "nutrition": nutrition,
            "image_url": _image_url(p),
        }
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `backend/`): `.venv/bin/pytest tests/test_openfoodfacts.py -v`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add backend/app/clients/openfoodfacts.py backend/tests/test_openfoodfacts.py
git commit -m "feat: OpenFoodFacts client returns front image_url"
```

---

## Task 5: ScanService — thread `image_url` and apply the dedup guard

**Files:**
- Modify: `backend/app/services/scan.py:1-2,48-70`
- Test: `backend/tests/test_scan_service.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_scan_service.py`:

```python
def test_off_image_url_flows_into_product(repo):
    off = FakeOFF({"name": "Chana", "brand": "Tata", "ingredients": ["chana"],
                   "nutrition": HEALTHY, "image_url": "https://img/x.jpg"})
    svc = ScanService(repo, off, FakeExtractor(None))
    res = svc.scan_barcode("777")
    assert res["product"]["image_url"] == "https://img/x.jpg"


def test_alternative_twin_with_same_name_is_not_suggested(repo):
    # Seed a healthy alternative that shares the scanned product's name+brand but a
    # different barcode (a catalog 'amazon:' twin). It must not be suggested.
    from app.scoring.scorer import score as score_fn
    twin_score = score_fn(["oats"], HEALTHY, "breakfast cereal")
    repo.save(barcode="amazon:T", name="Choco", brand="ACME",
              category="breakfast cereal", ingredients=["oats"], nutrition=HEALTHY,
              score=twin_score, source="amazon")
    off = FakeOFF({"name": "Choco", "brand": "ACME", "ingredients": ["sugar", "maida"],
                   "nutrition": JUNK})
    svc = ScanService(repo, off, FakeExtractor(None))
    res = svc.scan_barcode("888")
    assert "amazon:T" not in [a["barcode"] for a in res["alternatives"]]
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `.venv/bin/pytest tests/test_scan_service.py::test_off_image_url_flows_into_product -v`
Expected: FAIL — product dict has no `image_url` (KeyError) / twin still suggested.

- [ ] **Step 3: Thread `image_url` and the dedup key**

In `backend/app/services/scan.py`, change the imports at the top:

```python
from app.scoring.scorer import score as score_fn
from app.categories import normalize_category
from app.repositories.products import _norm_key
```

Replace `_envelope` and `_score_and_cache`:

```python
    def _envelope(self, source: str, product: dict) -> dict:
        """Wrap a product with its source and a few healthier same-category alternatives."""
        alternatives = self._repo.find_better_in_category(
            category=product.get("category", ""),
            min_overall=product["score"]["overall"],
            exclude_barcode=product["barcode"],
            better_than_grade=product["score"].get("grade", ""),
            exclude_name_brand=_norm_key(product.get("name", ""), product.get("brand", "")),
        )
        return {"source": source, "product": product, "alternatives": alternatives}

    def _score_and_cache(self, barcode: str, data: dict, source: str) -> dict:
        # Normalize the free-text category into a fixed bucket so this product can be
        # compared against peers (otherwise it lands in a category of one).
        category = normalize_category(data.get("category", ""), data.get("name", ""))
        scored = score_fn(data["ingredients"], data["nutrition"], category)
        self._repo.save(
            barcode=barcode, name=data["name"], brand=data["brand"],
            category=category,
            ingredients=data["ingredients"], nutrition=data["nutrition"],
            score=scored, source=source, image_url=data.get("image_url", ""),
        )
        return self._repo.get(barcode)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `backend/`): `.venv/bin/pytest tests/test_scan_service.py -v`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/scan.py backend/tests/test_scan_service.py
git commit -m "feat: thread image_url through scans; apply alternatives dedup guard"
```

---

## Task 6: Frontend — product image on the result screen + alternative thumbnails

**Files:**
- Modify: `frontend/src/api/types.ts:2,47-56`
- Modify: `frontend/src/screens/ResultScreen.tsx:90-95,136-150`
- Modify: `frontend/src/screens/ResultScreen.module.css`
- Test: `frontend/src/screens/ResultScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Append a new test inside the `describe("ResultScreen", ...)` block in `frontend/src/screens/ResultScreen.test.tsx`:

```tsx
  it("shows the product image when image_url is present", () => {
    render(
      <ResultScreen
        product={{ ...product, image_url: "https://img/x.jpg" }}
        onScanAgain={() => {}}
      />,
    );
    const img = screen.getByAltText(/kurkure/i) as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("https://img/x.jpg");
  });

  it("renders no product image when image_url is absent", () => {
    render(<ResultScreen product={product} onScanAgain={() => {}} />);
    expect(screen.queryByAltText(/kurkure/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `frontend/`): `npm test -- ResultScreen.test.tsx`
Expected: FAIL — no image rendered; also a TS error that `image_url` isn't on `Product`.

- [ ] **Step 3: Extend the types**

In `frontend/src/api/types.ts`, change the `Source` type (line 2) and add `image_url` to `Product`:

```ts
export type Source = "db" | "off" | "photo" | "amazon";
```

```ts
export interface Product {
  barcode: string;
  name: string;
  brand: string;
  category?: string;
  ingredients: string[];
  nutrition: Nutrition;
  source: Source;
  score: Score;
  image_url?: string;
}
```

- [ ] **Step 4: Render the image in the product header and alternative rows**

In `frontend/src/screens/ResultScreen.tsx`, replace the `.prod` block (lines 90-95):

```tsx
      <div className={styles.prod}>
        {product.image_url && (
          <img className={styles.prodImg} src={product.image_url} alt={product.name || "product"} />
        )}
        <div>
          <h3>{product.name || "Unknown product"}</h3>
          <p>{product.brand || product.barcode}</p>
        </div>
      </div>
```

And in the alternatives `.map` (the `<button>` per alternative), add a thumbnail as the first child inside the button, before the `altGrade` span:

```tsx
            {alternatives.map((a) => (
              <button
                key={a.barcode}
                className={styles.alt}
                onClick={() => onOpenProduct?.(a)}
              >
                {a.image_url && (
                  <img className={styles.altThumb} src={a.image_url} alt={a.name || "product"} />
                )}
                <span className={`${styles.altGrade} ${styles[gradeTone(a.score.grade)]}`}>
                  {a.score.grade}
                </span>
```

(Leave the rest of the button — `altInfo`, `altChev` — unchanged.)

- [ ] **Step 5: Add styles**

Append to `frontend/src/screens/ResultScreen.module.css`:

```css
.prodImg { width: 56px; height: 56px; border-radius: 12px; object-fit: contain;
  background: #fff; border: 1px solid var(--line); flex-shrink: 0; }
.altThumb { width: 34px; height: 34px; border-radius: 8px; object-fit: contain;
  background: #fff; border: 1px solid var(--line); flex-shrink: 0; }
```

Ensure `.prod` lays the image beside the text — confirm `.prod` includes `display: flex; align-items: center; gap: 12px;`. If it doesn't already, update the `.prod` rule:

```css
.prod { display: flex; align-items: center; gap: 12px; }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run (from `frontend/`): `npm test -- ResultScreen.test.tsx`
Expected: PASS (all in the file).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/screens/ResultScreen.tsx frontend/src/screens/ResultScreen.module.css frontend/src/screens/ResultScreen.test.tsx
git commit -m "feat: show product image on result screen + alternative thumbnails"
```

---

## Task 7: Seeder — `seed_catalog.py`

**Files:**
- Create: `backend/scripts/seed_catalog.py`
- Test: `backend/tests/test_seed_catalog.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_seed_catalog.py`:

```python
import json
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository
from scripts.seed_catalog import seed_records

RECORDS = [
    {"barcode": "8904063200365", "asin": "B1", "name": "Bombay Mix", "brand": "Haldiram's",
     "category": "namkeen", "ingredients": ["gram pulse", "peanuts"],
     "nutrition": {"energy_kj": 2022, "sugars_g": 1.6, "sat_fat_g": 5.0, "salt_g": 1.3,
                   "fibre_g": 0, "protein_g": 18.9, "fruit_veg_nuts_pct": 0},
     "display_image_url": "https://img/bombay.jpg"},
    {"barcode": "amazon:B2", "asin": "B2", "name": "Choco Flakes", "brand": "ACME",
     "category": "breakfast cereal", "ingredients": ["sugar", "maida"],
     "nutrition": {"energy_kj": 1600, "sugars_g": 30, "sat_fat_g": 2, "salt_g": 0.5,
                   "fibre_g": 1, "protein_g": 6, "fruit_veg_nuts_pct": 0},
     "display_image_url": "https://img/choco.jpg"},
]


def _repo():
    engine = make_engine("sqlite://")
    init_db(engine)
    return ProductRepository(make_session_factory(engine))


def test_seed_records_scores_and_stores_with_image_and_source():
    repo = _repo()
    seed_records(repo, RECORDS)
    p = repo.get("8904063200365")
    assert p is not None
    assert p["source"] == "amazon"
    assert p["image_url"] == "https://img/bombay.jpg"
    assert p["score"]["grade"] in ("A", "B", "C", "D", "E")
    assert repo.get("amazon:B2")["category"] == "breakfast cereal"


def test_seed_records_is_idempotent():
    repo = _repo()
    seed_records(repo, RECORDS)
    seed_records(repo, RECORDS)
    # Still one row per barcode (no duplication).
    assert repo.get("8904063200365") is not None
    assert repo.get("amazon:B2") is not None


def test_seed_records_skips_malformed_without_aborting():
    repo = _repo()
    seed_records(repo, [{"barcode": "bad"}] + RECORDS)  # missing fields -> skipped
    assert repo.get("8904063200365") is not None  # good ones still seeded
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `.venv/bin/pytest tests/test_seed_catalog.py -v`
Expected: FAIL — `scripts.seed_catalog` doesn't exist.

- [ ] **Step 3: Write `seed_catalog.py`**

Create `backend/scripts/seed_catalog.py`:

```python
"""Seed the Amazon catalog into the Parakh DB from catalog_extracted.json.

Each record is scored through the REAL scorer and upserted via ProductRepository
(source='amazon'), so catalog items are identical in shape to live scans. Idempotent
by barcode. Run inside the backend container:
    docker exec parakh-backend python -m scripts.seed_catalog
"""
import json
import os
from app.config import get_settings
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository
from app.scoring.scorer import score as score_fn

_DATA = os.path.join(os.path.dirname(__file__), "catalog_extracted.json")
_REQUIRED = ("barcode", "name", "category", "ingredients", "nutrition")


def seed_records(repo: ProductRepository, records: list[dict]) -> int:
    seeded = 0
    for r in records:
        if not all(r.get(k) is not None for k in _REQUIRED):
            print(f"  SKIP malformed: {r.get('asin') or r.get('barcode')}")
            continue
        try:
            scored = score_fn(r["ingredients"], r["nutrition"], r["category"])
            repo.save(
                barcode=r["barcode"], name=r["name"], brand=r.get("brand", ""),
                category=r["category"], ingredients=r["ingredients"],
                nutrition=r["nutrition"], score=scored, source="amazon",
                image_url=r.get("display_image_url", ""),
            )
            seeded += 1
            print(f"  {scored['grade']} {scored['overall']:>3}/100  {r['name']}  [{r['barcode']}]")
        except Exception as e:  # one bad record must not abort the whole seed
            print(f"  ERROR {r.get('asin') or r.get('barcode')}: {e}")
    return seeded


def main() -> None:
    settings = get_settings()
    engine = make_engine(settings.db_url)
    init_db(engine)
    repo = ProductRepository(make_session_factory(engine))
    with open(_DATA, encoding="utf-8") as f:
        records = json.load(f)
    print(f"Seeding {len(records)} catalog records into {settings.db_url} ...")
    n = seed_records(repo, records)
    print(f"Done. Seeded {n}/{len(records)}.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `backend/`): `.venv/bin/pytest tests/test_seed_catalog.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/seed_catalog.py backend/tests/test_seed_catalog.py
git commit -m "feat: seed_catalog.py loads scored Amazon catalog from JSON"
```

---

## Task 8: Build helpers — `catalog_build.py` (pure functions)

**Files:**
- Create: `backend/scripts/catalog_build.py`
- Test: `backend/tests/test_catalog_build.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_catalog_build.py`:

```python
from scripts.catalog_build import (
    category_for_filename, clean_brand, derive_name, filter_own_images,
    validate_nutrition, pick_barcode, assemble_record, CATEGORY_MAP,
)

S3 = "https://sumits-private-storage.s3.amazonaws.com"


def test_category_for_filename_maps_all_four():
    assert category_for_filename("breakfast_products_sumits_private.json") == "breakfast cereal"
    assert category_for_filename("dark_chocolate_products.json") == "chocolate"
    assert category_for_filename("drinks_products.json") == "drinks"
    assert category_for_filename("namkeen_snacks_products.json") == "namkeen"
    assert category_for_filename("unknown.json") == ""


def test_clean_brand_strips_storefront_wrapping():
    assert clean_brand("Visit the Kellogg's Store") == "Kellogg's"
    assert clean_brand("Saffola Store") == "Saffola"
    assert clean_brand(None) == ""
    assert clean_brand("  Pintola  ") == "Pintola"


def test_derive_name_prefers_agent_then_cleans_title():
    assert derive_name("Kellogg's Chocos", "anything") == "Kellogg's Chocos"
    assert derive_name("", "Kellogg's Multigrain Chocos, 385G | More Chocolatey") == \
        "Kellogg's Multigrain Chocos"
    assert derive_name(None, "Pintola Oats 1kg | High Protein") == "Pintola Oats"


def test_filter_own_images_keeps_matching_asin_only():
    urls = [f"{S3}/breakfast/A1/x.jpg", f"{S3}/breakfast/A2/y.jpg", f"{S3}/breakfast/A1/z.jpg"]
    assert filter_own_images(urls, "A1") == [f"{S3}/breakfast/A1/x.jpg", f"{S3}/breakfast/A1/z.jpg"]


GOOD = {"energy_kj": 2022, "sugars_g": 1.6, "sat_fat_g": 5.0, "salt_g": 1.3,
        "fibre_g": 0, "protein_g": 18.9, "fruit_veg_nuts_pct": 0}


def test_validate_nutrition_accepts_plausible():
    assert validate_nutrition(GOOD, True, "high") == (True, "")


def test_validate_nutrition_rejects_each_failure_mode():
    assert validate_nutrition(GOOD, False, "high")[0] is False           # not found
    assert validate_nutrition(GOOD, True, "low")[0] is False             # low confidence
    assert validate_nutrition({**GOOD, "energy_kj": 99999}, True, "high")[0] is False
    assert validate_nutrition({**GOOD, "sugars_g": 250}, True, "high")[0] is False
    assert validate_nutrition({**GOOD, "protein_g": -1}, True, "high")[0] is False
    allzero = {k: 0 for k in GOOD}
    assert validate_nutrition(allzero, True, "high")[0] is False


def test_pick_barcode_takes_first_valid_ean_else_synthetic():
    decoded = [(f"{S3}/x/A1/a.jpg", "", "NONE"),
               (f"{S3}/x/A1/b.jpg", "8904063200365", "EAN13")]
    assert pick_barcode(decoded, "A1") == ("8904063200365", f"{S3}/x/A1/b.jpg")
    assert pick_barcode([], "A1") == ("amazon:A1", "")
    # non-digit / wrong format ignored
    assert pick_barcode([("u", "ABC", "CODE128")], "A1") == ("amazon:A1", "")


def test_assemble_record_builds_committed_shape():
    own = [f"{S3}/namkeen_snacks/A1/front.jpg", f"{S3}/namkeen_snacks/A1/nutri.jpg",
           f"{S3}/namkeen_snacks/A1/ingr.jpg"]
    agent = {"name": "Bombay Mix", "found_nutrition": True, "nutrition": GOOD,
             "ingredients": ["gram pulse"], "display_image_index": 0,
             "nutrition_image_index": 1, "ingredients_image_index": 2, "confidence": "high"}
    rec = assemble_record(asin="A1", title="Haldiram's Bombay Mix, 200g", raw_brand="Visit the Haldiram's Store",
                          category="namkeen", own_images=own, agent=agent,
                          barcode="8904063200365", barcode_image_url=f"{S3}/namkeen_snacks/A1/bar.jpg")
    assert rec["barcode"] == "8904063200365"
    assert rec["name"] == "Bombay Mix"
    assert rec["brand"] == "Haldiram's"
    assert rec["category"] == "namkeen"
    assert rec["display_image_url"] == own[0]
    assert rec["nutrition_image_url"] == own[1]
    assert rec["ingredients_image_url"] == own[2]
    assert rec["barcode_image_url"] == f"{S3}/namkeen_snacks/A1/bar.jpg"
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `.venv/bin/pytest tests/test_catalog_build.py -v`
Expected: FAIL — `scripts.catalog_build` doesn't exist.

- [ ] **Step 3: Write `catalog_build.py`**

Create `backend/scripts/catalog_build.py`:

```python
"""Pure helpers for the one-time Amazon catalog build (Task 9). No I/O, no network —
the orchestration in Task 9 supplies decoded barcodes and subagent extractions and
calls these to assemble committed records. Safe to unit-test in isolation."""
import re

CATEGORY_MAP = {
    "breakfast": "breakfast cereal",
    "dark_chocolate": "chocolate",
    "drinks": "drinks",
    "namkeen_snacks": "namkeen",
}

_CORE = ("energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g")
_EAN_FORMATS = {"EAN13", "EAN8", "UPCA", "UPCE"}


def category_for_filename(filename: str) -> str:
    key = (filename.replace("_sumits_private.json", "")
                   .replace("_products.json", "")
                   .replace(".json", ""))
    return CATEGORY_MAP.get(key, "")


def clean_brand(raw) -> str:
    if not raw:
        return ""
    b = str(raw).strip()
    if b.lower().startswith("visit the "):
        b = b[len("visit the "):]
    if b.lower().endswith(" store"):
        b = b[: -len(" store")]
    return b.strip()


def derive_name(agent_name, title: str) -> str:
    if agent_name and str(agent_name).strip():
        return str(agent_name).strip()
    seg = re.split(r"[|,]", title or "", maxsplit=1)[0].strip()
    seg = re.sub(r"\s+\d[\d.]*\s*(g|kg|ml|l)\b.*$", "", seg, flags=re.I).strip()
    return seg


def filter_own_images(image_urls, asin: str) -> list:
    out = []
    for u in image_urls or []:
        m = re.search(r"\.amazonaws\.com/[^/]+/([^/]+)/", u)
        if m and m.group(1) == asin:
            out.append(u)
    return out


def validate_nutrition(nutrition: dict, found: bool, confidence: str):
    if not found:
        return (False, "no_nutrition")
    if confidence == "low":
        return (False, "low_confidence")
    g = lambda k: float((nutrition or {}).get(k, 0) or 0)
    for k in _CORE + ("fruit_veg_nuts_pct",):
        if g(k) < 0:
            return (False, f"implausible:{k}")
    if g("energy_kj") > 3800:
        return (False, "implausible:energy_kj")
    for k in ("sugars_g", "sat_fat_g", "protein_g", "fibre_g", "salt_g"):
        if g(k) > 100:
            return (False, f"implausible:{k}")
    if not any(g(k) > 0 for k in _CORE):
        return (False, "no_nutrition")
    return (True, "")


def pick_barcode(decoded, asin: str):
    """decoded: list of (image_url, text, format). Return (barcode, barcode_image_url)."""
    for url, text, fmt in decoded:
        if fmt in _EAN_FORMATS and str(text).isdigit():
            return (str(text), url)
    return (f"amazon:{asin}", "")


def _img_at(own_images, idx):
    if isinstance(idx, int) and 0 <= idx < len(own_images):
        return own_images[idx]
    return ""


def assemble_record(*, asin, title, raw_brand, category, own_images, agent,
                    barcode, barcode_image_url) -> dict:
    return {
        "barcode": barcode,
        "asin": asin,
        "name": derive_name(agent.get("name"), title),
        "brand": clean_brand(raw_brand),
        "category": category,
        "ingredients": agent.get("ingredients", []),
        "nutrition": agent.get("nutrition", {}),
        "display_image_url": _img_at(own_images, agent.get("display_image_index")) or (own_images[0] if own_images else ""),
        "nutrition_image_url": _img_at(own_images, agent.get("nutrition_image_index")),
        "ingredients_image_url": _img_at(own_images, agent.get("ingredients_image_index")),
        "barcode_image_url": barcode_image_url,
        "confidence": agent.get("confidence", ""),
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `backend/`): `.venv/bin/pytest tests/test_catalog_build.py -v`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/catalog_build.py backend/tests/test_catalog_build.py
git commit -m "feat: pure build helpers for catalog extraction"
```

---

## Task 9: Run the one-time extraction build (INLINE — not a TDD task)

> Run by Claude Code in the main session (needs the Workflow tool + local dataset at `~/work/video-upload-s3`). Produces the two committed JSON files. `zxing-cpp`+`pillow` are already in the backend `.venv` from brainstorming; if not: `.venv/bin/pip install zxing-cpp pillow`.

- [ ] **Step 1: Build the work-list + decode barcodes**

Run this from `/Users/rsumit123/work/video-upload-s3` with the backend venv python; it filters own images, decodes barcodes locally, and writes `worklist.json`:

```python
# /Users/rsumit123/work/video-upload-s3/_build_worklist.py
import json, glob, os, re
from urllib.parse import unquote
import zxingcpp
from PIL import Image

ROOT = "/Users/rsumit123/work/video-upload-s3"
LOCAL = os.path.join(ROOT, "images")   # ABSOLUTE so subagents can Read the paths
S3RE = re.compile(r"\.amazonaws\.com/[^/]+/([^/]+)/")
CATMAP = {"breakfast": "breakfast cereal", "dark_chocolate": "chocolate",
          "drinks": "drinks", "namkeen_snacks": "namkeen"}
EAN = {"EAN13", "EAN8", "UPCA", "UPCE"}

def cat_key(fn): return fn.replace("_products_sumits_private.json", "")

def own(urls, asin): return [u for u in urls if (m := S3RE.search(u)) and m.group(1) == asin]

def local_path(url):
    # url path after the bucket -> images/<category>/<asin>/<file>; URL-decode so
    # '%2B' becomes the literal '+' that's on disk. Returns an ABSOLUTE path.
    key = unquote(url.split(".amazonaws.com/", 1)[1])
    return os.path.join(LOCAL, *key.split("/"))

def decode(url):
    p = local_path(url)
    if not os.path.exists(p): return None
    try:
        for r in zxingcpp.read_barcodes(Image.open(p)):
            if r.format.name in EAN and r.text.isdigit():
                return (url, r.text, r.format.name)
    except Exception:
        pass
    return None

work = []
for f in sorted(glob.glob("*_products_sumits_private.json")):
    cat_bucket = CATMAP[cat_key(f)]
    for p in json.load(open(f)):
        ow = own(p.get("image_urls", []), p["asin"])
        decoded = [d for d in (decode(u) for u in ow) if d]
        work.append({"asin": p["asin"], "title": p.get("title", ""),
                     "raw_brand": p.get("brand"), "category": cat_bucket,
                     "own_images": ow, "local_paths": [local_path(u) for u in ow],
                     "decoded": decoded})
json.dump(work, open("worklist.json", "w"), ensure_ascii=False, indent=1)
print(f"{len(work)} products; with own images: {sum(1 for w in work if w['own_images'])}; "
      f"with barcode: {sum(1 for w in work if w['decoded'])}")
```

Run: `cd /Users/rsumit123/work/video-upload-s3 && /Users/rsumit123/work/nutri-content/backend/.venv/bin/python _build_worklist.py`
Expected: prints counts (≈344 products; ~273 with images; ~141 with barcode).

- [ ] **Step 2: Extract via a Workflow (subagents read local images)**

Run a Workflow that pipelines over `worklist.json` (pass it as `args`), one subagent per product with own images, each returning the schema below. Use this script (the orchestrator collects results and returns them):

```javascript
export const meta = {
  name: 'catalog-extract',
  description: 'Read each product\'s label images and extract nutrition/ingredients/name + image picks',
  phases: [{ title: 'Extract' }],
}
const SCHEMA = {
  type: "object",
  required: ["asin", "name", "found_nutrition", "nutrition", "ingredients",
             "display_image_index", "nutrition_image_index", "ingredients_image_index", "confidence"],
  properties: {
    asin: { type: "string" }, name: { type: "string" },
    found_nutrition: { type: "boolean" },
    nutrition: { type: "object", required: ["energy_kj","sugars_g","sat_fat_g","salt_g","fibre_g","protein_g","fruit_veg_nuts_pct"],
      properties: { energy_kj:{type:"number"}, sugars_g:{type:"number"}, sat_fat_g:{type:"number"},
        salt_g:{type:"number"}, fibre_g:{type:"number"}, protein_g:{type:"number"}, fruit_veg_nuts_pct:{type:"number"} } },
    ingredients: { type: "array", items: { type: "string" } },
    display_image_index: { type: "integer" }, nutrition_image_index: { type: "integer" },
    ingredients_image_index: { type: "integer" }, confidence: { type: "string", enum: ["high","medium","low"] },
  },
}
const items = (args || []).filter(p => p.own_images && p.own_images.length)
const results = await pipeline(items, (p) => agent(
  `You are extracting packaged-food label data for ONE product (asin ${p.asin}, title: ${JSON.stringify(p.title)}).
Read these local images (indices matter, 0-based):
${p.local_paths.map((fp,i)=>`  [${i}] ${fp}`).join("\n")}
Use the Read tool on each image. Extract the product's nutrition and ingredients from whichever images show the nutrition table and ingredients list. Indian labels give energy in kcal and sodium in mg: convert energy kcal->kJ (x4.184) and sodium mg->salt g (mg x 2.5 / 1000). Report per-100g values; if only per-serving is shown, scale to 100g. If several different nutrition panels appear (variants), pick the one matching the product title/pack and set confidence accordingly.
Also choose: display_image_index (cleanest front-of-pack product shot), nutrition_image_index, ingredients_image_index (overlap allowed). name = concise consumer product name from the front pack (brand + product, no pack size or marketing).
If NO nutrition table is visible in any image, set found_nutrition=false. Set asin to "${p.asin}".`,
  { label: `extract:${p.asin}`, phase: 'Extract', schema: SCHEMA }
).catch(() => null))
return results.filter(Boolean)
```

Invoke `Workflow({ script: <above>, args: <contents of worklist.json> })`. Save the returned array to `/Users/rsumit123/work/video-upload-s3/extractions.json` (write it with a Bash/python step).

- [ ] **Step 3: Assemble + validate → the two committed JSON files**

Run this (uses the Task 8 helpers + Task 9 worklist + extractions):

```python
# /Users/rsumit123/work/video-upload-s3/_assemble.py
import json, sys
sys.path.insert(0, "/Users/rsumit123/work/nutri-content/backend")
from scripts.catalog_build import validate_nutrition, pick_barcode, assemble_record

work = {w["asin"]: w for w in json.load(open("worklist.json"))}
extractions = {e["asin"]: e for e in json.load(open("extractions.json"))}

good, skipped = [], []
for asin, w in work.items():
    if not w["own_images"]:
        skipped.append({"asin": asin, "category": w["category"], "reason": "no_images"}); continue
    e = extractions.get(asin)
    if not e:
        skipped.append({"asin": asin, "category": w["category"], "reason": "no_extraction"}); continue
    ok, reason = validate_nutrition(e.get("nutrition", {}), e.get("found_nutrition", False), e.get("confidence", ""))
    if not ok:
        skipped.append({"asin": asin, "category": w["category"], "reason": reason}); continue
    barcode, bimg = pick_barcode([tuple(d) for d in w["decoded"]], asin)
    good.append(assemble_record(asin=asin, title=w["title"], raw_brand=w["raw_brand"],
        category=w["category"], own_images=w["own_images"], agent=e,
        barcode=barcode, barcode_image_url=bimg))

DEST = "/Users/rsumit123/work/nutri-content/backend/scripts"
json.dump(good, open(f"{DEST}/catalog_extracted.json", "w"), ensure_ascii=False, indent=1)
json.dump(skipped, open(f"{DEST}/catalog_skipped.json", "w"), ensure_ascii=False, indent=1)
print(f"extracted: {len(good)}  skipped: {len(skipped)}")
```

Run: `cd /Users/rsumit123/work/video-upload-s3 && /Users/rsumit123/work/nutri-content/backend/.venv/bin/python _assemble.py`
Expected: prints `extracted: N  skipped: M` (N+M=344). `catalog_extracted.json` + `catalog_skipped.json` now exist under `backend/scripts/`.

---

## Task 10: Spot-check & commit the extracted catalog

**Files:**
- Commit: `backend/scripts/catalog_extracted.json`, `backend/scripts/catalog_skipped.json`

- [ ] **Step 1: Sanity-scan the output**

Run (from `backend/`):
```bash
.venv/bin/python -c "import json; d=json.load(open('scripts/catalog_extracted.json')); print('records:',len(d)); print('with real barcode:',sum(1 for r in d if not r['barcode'].startswith('amazon:'))); import collections; print(collections.Counter(r['category'] for r in d))"
```
Expected: a record count, the real-barcode share, and a per-category spread across the 4 buckets.

- [ ] **Step 2: Eyeball a few entries against their images**

Open 3–5 entries in `catalog_extracted.json`; for each, open its `nutrition_image_url`/`ingredients_image_url` in a browser and confirm the numbers/ingredients match. Hand-fix any obvious extraction error directly in the JSON. (This is the human review gate from the spec.)

- [ ] **Step 3: Commit the data**

```bash
git add backend/scripts/catalog_extracted.json backend/scripts/catalog_skipped.json
git commit -m "data: add extracted+scored Amazon catalog (Phase 1)"
```

---

## Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Backend suite**

Run (from `backend/`): `.venv/bin/pytest -q`
Expected: all pass, `0 failed`.

- [ ] **Step 2: Seed locally against a scratch DB and verify**

Run (from `backend/`):
```bash
PARAKH_DB_URL="sqlite:///./_scratch_catalog.db" .venv/bin/python -m scripts.seed_catalog | tail -5
PARAKH_DB_URL="sqlite:///./_scratch_catalog.db" .venv/bin/python -c "from app.config import get_settings; from app.db import make_engine, make_session_factory, init_db; from app.repositories.products import ProductRepository; e=make_engine(get_settings().db_url); init_db(e); r=ProductRepository(make_session_factory(e)); from sqlalchemy import select, func; from app.models import Product; s=make_session_factory(e)(); print('rows:', s.scalar(select(func.count()).select_from(Product)))"
rm -f _scratch_catalog.db
```
Expected: seeding prints graded lines and `Done. Seeded N/N`; the row count equals the catalog size.

- [ ] **Step 3: Frontend suite + build**

Run (from `frontend/`): `npm test` then `npm run build`
Expected: all tests pass; `tsc -b` + `vite build` succeed (no type errors — confirms `image_url`/`Source` changes compile).

- [ ] **Step 4: Commit (only if Steps 1–3 required fixes)**

```bash
git add -A && git commit -m "test: fixes from catalog-import verification"
```

---

## Task 12: Deploy

**Files:** none (deploy actions)

- [ ] **Step 1: Push**

```bash
git push origin main
```
(Vercel auto-deploys the frontend — no new env vars. The `image_url` migration runs on backend startup.)

- [ ] **Step 2: Backend redeploy + seed on the VM**

```bash
ssh ssh-social "cd ~/parakh && git pull -q && cd backend && docker compose up -d --build --force-recreate && docker exec parakh-backend python -m scripts.seed_catalog | tail -5"
```
Expected: container rebuilds/restarts; seeding prints graded lines and `Done.` (`zxing`/`pillow` are NOT needed on the VM — only `catalog_extracted.json` is read).

- [ ] **Step 3: Smoke-test live**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://parakh-api.skdev.one/health
```
Expected: `200`. Then scan a real barcode that was imported (pick one from `catalog_extracted.json` whose `barcode` is not `amazon:`) in the app and confirm it returns instantly with a product image; scan a junk product and confirm "Healthier options" now show catalog items with thumbnails.
