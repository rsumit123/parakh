# Explore Catalog — Backend (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only catalog API — list categories with counts, and list/filter/search products (healthiest-first) — that the Explore UI will consume.

**Architecture:** Two new `ProductRepository` query methods + two auth-gated `GET` endpoints under `/catalog`. No migration; reuses the existing `_to_dict` product shape and `current_identity` bearer dependency; no scan quota.

**Tech Stack:** FastAPI + SQLAlchemy + SQLite, pytest (`backend/.venv`).

**Spec:** `docs/superpowers/specs/2026-06-02-explore-catalog-design.md`

---

## File Structure
- Modify: `backend/app/repositories/products.py` — add `category_counts()`, `list_products()`.
- Modify: `backend/app/main.py` — add `GET /catalog/categories`, `GET /catalog/products`.
- Test: `backend/tests/test_products_repo.py`, `backend/tests/test_api.py`.

Run backend tests from `backend/` with `.venv/bin/pytest`.

---

## Task 1: Repository — `category_counts()`

**Files:**
- Modify: `backend/app/repositories/products.py:1-2`
- Test: `backend/tests/test_products_repo.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_products_repo.py`:

```python
def test_category_counts_groups_excludes_empty_and_orders_desc(repo):
    _save(repo, "d1", "drinks", 50); _save(repo, "d2", "drinks", 60)
    _save(repo, "n1", "namkeen", 40)
    _save(repo, "u1", "", 70)  # uncategorized -> excluded
    out = repo.category_counts()
    assert out == [{"category": "drinks", "count": 2}, {"category": "namkeen", "count": 1}]
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `.venv/bin/pytest tests/test_products_repo.py::test_category_counts_groups_excludes_empty_and_orders_desc -v`
Expected: FAIL — `category_counts` does not exist.

- [ ] **Step 3: Implement**

In `backend/app/repositories/products.py`, change the import line:

```python
from sqlalchemy import select, func
```

Add this method to `ProductRepository` (after `find_better_in_category`):

```python
    def category_counts(self) -> list[dict]:
        """Non-empty categories with their product counts, most products first."""
        with self._Session() as s:
            rows = s.execute(
                select(Product.category, func.count())
                .where(Product.category != "")
                .group_by(Product.category)
                .order_by(func.count().desc(), Product.category.asc())
            ).all()
            return [{"category": c, "count": n} for c, n in rows]
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `backend/`): `.venv/bin/pytest tests/test_products_repo.py -v`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories/products.py backend/tests/test_products_repo.py
git commit -m "feat: ProductRepository.category_counts"
```

---

## Task 2: Repository — `list_products()`

**Files:**
- Modify: `backend/app/repositories/products.py`
- Test: `backend/tests/test_products_repo.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_products_repo.py` (uses a local helper that controls name/brand for search tests):

```python
def _saven(repo, barcode, category, overall, grade, name, brand):
    repo.save(barcode=barcode, name=name, brand=brand, category=category,
              ingredients=[], nutrition={"sugars_g": 1.0},
              score={"overall": overall, "grade": grade, "breakdown": {}}, source="amazon")


def test_list_products_by_category_healthiest_first(repo):
    _saven(repo, "a", "drinks", 30, "D", "Cola", "Coke")
    _saven(repo, "b", "drinks", 88, "A", "Coconut Water", "Raw")
    _saven(repo, "c", "namkeen", 90, "A", "Makhana", "Farmley")
    out = repo.list_products(category="drinks")
    assert out["total"] == 2
    assert [p["barcode"] for p in out["items"]] == ["b", "a"]  # 88 before 30


def test_list_products_grade_filter(repo):
    _saven(repo, "a", "drinks", 30, "D", "Cola", "Coke")
    _saven(repo, "b", "drinks", 88, "A", "Coconut Water", "Raw")
    out = repo.list_products(category="drinks", grade="A")
    assert [p["barcode"] for p in out["items"]] == ["b"]
    assert out["total"] == 1


def test_list_products_search_name_and_brand_case_insensitive(repo):
    _saven(repo, "a", "chocolate", 48, "C", "99% Cacao", "Amul")
    _saven(repo, "b", "drinks", 69, "B", "Buttermilk", "AMUL")
    _saven(repo, "c", "drinks", 29, "D", "Cola", "Coke")
    out = repo.list_products(q="amul")
    assert {p["barcode"] for p in out["items"]} == {"a", "b"}  # name/brand match, any category


def test_list_products_limit_clamped_and_total_reported(repo):
    for i in range(5):
        _saven(repo, f"p{i}", "drinks", 50 + i, "B", f"P{i}", "B")
    out = repo.list_products(category="drinks", limit=2)
    assert len(out["items"]) == 2
    assert out["total"] == 5
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `.venv/bin/pytest tests/test_products_repo.py::test_list_products_by_category_healthiest_first -v`
Expected: FAIL — `list_products` does not exist.

- [ ] **Step 3: Implement**

Add to `ProductRepository`:

```python
    def list_products(self, *, category: str = "", grade: str = "", q: str = "",
                      limit: int = 60, offset: int = 0) -> dict:
        """Filtered product list, healthiest first. Filters (category/grade/q) are
        ANDed; any blank filter is ignored. `q` matches name OR brand, case-insensitive.
        Returns {items: [...], total: <count before paging>}."""
        limit = max(1, min(limit, 200))
        offset = max(0, offset)
        conds = []
        if category:
            conds.append(Product.category == category)
        if grade:
            conds.append(Product.score_grade == grade)
        if q:
            like = f"%{q.strip().lower()}%"
            conds.append(func.lower(Product.name).like(like) | func.lower(Product.brand).like(like))
        with self._Session() as s:
            count_q = select(func.count()).select_from(Product)
            list_q = select(Product)
            for c in conds:
                count_q = count_q.where(c)
                list_q = list_q.where(c)
            total = s.scalar(count_q) or 0
            rows = s.scalars(
                list_q.order_by(Product.score_overall.desc(), Product.name.asc())
                      .limit(limit).offset(offset)
            ).all()
            return {"items": [self._to_dict(p) for p in rows], "total": total}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `backend/`): `.venv/bin/pytest tests/test_products_repo.py -v`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories/products.py backend/tests/test_products_repo.py
git commit -m "feat: ProductRepository.list_products (filter/search, healthiest-first)"
```

---

## Task 3: API — `/catalog/categories` and `/catalog/products`

**Files:**
- Modify: `backend/app/main.py:25-27,95-97`
- Test: `backend/tests/test_api.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_api.py`:

```python
def _seed_catalog(client_app_sf):
    # client_app_sf: (client, sf) — seed a few products straight via the repo
    from app.repositories.products import ProductRepository
    repo = ProductRepository(client_app_sf[1])
    def s(bc, cat, ov, gr, nm, br):
        repo.save(barcode=bc, name=nm, brand=br, category=cat, ingredients=[],
                  nutrition={"sugars_g": 1.0}, score={"overall": ov, "grade": gr, "breakdown": {}},
                  source="amazon")
    s("d1", "drinks", 88, "A", "Coconut Water", "Raw")
    s("d2", "drinks", 29, "D", "Cola", "Coke")
    s("n1", "namkeen", 82, "A", "Makhana", "Farmley")


def _build_with_sf():
    engine = make_engine("sqlite://"); init_db(engine)
    sf = make_session_factory(engine)
    app = create_app(session_factory=sf, off_client=FakeOFF(None),
                     label_extractor=FakeExtractor(None), secret="test",
                     guest_limit=3, free_limit=10, today="2026-05-31")
    return TestClient(app), sf


def test_catalog_categories_lists_counts():
    client, sf = _build_with_sf()
    _seed_catalog((client, sf))
    headers = _guest_headers(client)
    r = client.get("/catalog/categories", headers=headers)
    assert r.status_code == 200
    cats = r.json()["categories"]
    assert {"category": "drinks", "count": 2} in cats
    assert {"category": "namkeen", "count": 1} in cats


def test_catalog_products_filters_by_category_and_grade():
    client, sf = _build_with_sf()
    _seed_catalog((client, sf))
    headers = _guest_headers(client)
    r = client.get("/catalog/products?category=drinks", headers=headers)
    body = r.json()
    assert body["total"] == 2
    assert [p["barcode"] for p in body["items"]] == ["d1", "d2"]  # healthiest first
    r2 = client.get("/catalog/products?category=drinks&grade=A", headers=headers)
    assert [p["barcode"] for p in r2.json()["items"]] == ["d1"]


def test_catalog_products_search_query():
    client, sf = _build_with_sf()
    _seed_catalog((client, sf))
    headers = _guest_headers(client)
    r = client.get("/catalog/products?q=cola", headers=headers)
    assert [p["barcode"] for p in r.json()["items"]] == ["d2"]


def test_catalog_requires_auth():
    client, _ = _build_with_sf()
    assert client.get("/catalog/categories").status_code == 401
    assert client.get("/catalog/products?category=drinks").status_code == 401
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `.venv/bin/pytest tests/test_api.py::test_catalog_categories_lists_counts -v`
Expected: FAIL — 404 (routes don't exist).

- [ ] **Step 3: Add a catalog repo handle in `create_app`**

In `backend/app/main.py`, where the services are constructed (after `scanner = ScanService(...)`, ~line 27), add:

```python
    catalog = ProductRepository(session_factory)
```

(`ProductRepository` is already imported at the top of `main.py`.)

- [ ] **Step 4: Add the routes**

In `backend/app/main.py`, add these routes just before the `@app.get("/health")` route:

```python
    @app.get("/catalog/categories")
    def catalog_categories(identity: dict = Depends(current_identity)):
        return {"categories": catalog.category_counts()}

    @app.get("/catalog/products")
    def catalog_products(category: str = "", grade: str = "", q: str = "",
                         limit: int = 60, offset: int = 0,
                         identity: dict = Depends(current_identity)):
        g = grade.upper()
        if g not in ("A", "B", "C", "D", "E"):
            g = ""
        return catalog.list_products(category=category, grade=g, q=q,
                                     limit=limit, offset=offset)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `backend/`): `.venv/bin/pytest tests/test_api.py -v`
Expected: PASS (all, including the four new catalog tests).

- [ ] **Step 6: Run the full backend suite**

Run (from `backend/`): `.venv/bin/pytest -q`
Expected: all pass, `0 failed`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/main.py backend/tests/test_api.py
git commit -m "feat: GET /catalog/categories and /catalog/products (auth-gated, no quota)"
```

---

## Task 4: Deploy backend

**Files:** none (deploy)

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Redeploy on the VM**

```bash
ssh ssh-social "cd ~/parakh && git pull -q && cd backend && docker compose up -d --build --force-recreate"
```
Expected: container rebuilds/restarts healthy.

- [ ] **Step 3: Smoke-test live**

```bash
TOK=$(curl -s -X POST https://parakh-api.skdev.one/auth/guest -H 'Content-Type: application/json' -d '{"device_id":"cat-smoke"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s "https://parakh-api.skdev.one/catalog/categories" -H "Authorization: Bearer $TOK"
curl -s "https://parakh-api.skdev.one/catalog/products?category=drinks&grade=A&limit=3" -H "Authorization: Bearer $TOK"
```
Expected: categories JSON with real counts (drinks/namkeen/etc.); products JSON with A-grade drinks, healthiest first, each carrying `image_url` + full `score`.
