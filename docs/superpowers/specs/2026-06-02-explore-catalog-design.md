# Explore Catalog (Phase 2) — Design Spec

**Date:** 2026-06-02
**Status:** Approved (design), pending implementation plan

## Goal

Let users browse and search the whole product catalog (not just scan): a bottom tab bar (Home · Explore · History), an Explore tab that lands on category tiles, drills into a category with a grade filter, and a global name/brand search — every product opening its full score page.

## Why

The catalog now holds ~283 scored products (Phase 1), but they're only reachable as scan results or "Healthier options." Explore turns Parakh into something you can open and browse — discover healthy products per category, search by name, and filter by grade — without scanning.

## Scope

**In scope:**
- Backend: a read-only catalog API — category list with counts, and a product list endpoint filtered by category / grade / search query (healthiest-first).
- Frontend: a bottom **TabBar** (Home · Explore · History); an **ExploreScreen** (category tiles + search); a **CategoryScreen** (product grid + grade filter); product tap → existing result page.
- A small **navigation refactor** so the tab bar, drill-down, and the device Back button all behave coherently (extends the History-API back support shipped earlier).

**Out of scope (YAGNI):** pagination/infinite scroll (load up to a capped limit per category; note if truncated), price/rating display, sorting options beyond healthiest-first, multi-select grade filter, favouriting.

## Data (live)

~283 products across categories: drinks (90), namkeen (74), breakfast cereal (63), chocolate (40), biscuits (4), condiments & spices (3), spreads & sauces (3), and a few uncategorized (`""`, excluded from Explore). Every product row already has `name, brand, category, image_url, nutrition, score_json (full), source`.

## Backend

### Repository (`backend/app/repositories/products.py`)

- `category_counts() -> list[dict]` — `[{"category": str, "count": int}]` for every **non-empty** category, ordered by count desc. (SQL `GROUP BY category` where `category != ''`.)
- `list_products(*, category: str = "", grade: str = "", q: str = "", limit: int = 60, offset: int = 0) -> dict` — returns `{"items": [<_to_dict>...], "total": int}`:
  - `category` (exact bucket) and/or `q` (case-insensitive substring on `name` OR `brand`) and/or `grade` (exact `score_grade`) as filters, ANDed; any omitted filter is ignored.
  - Sort: `score_overall` **desc** (healthiest first), tie-break `name` asc.
  - `total` = count matching the filters (before limit/offset); `items` = the page.
  - `limit` clamped to ≤ 200.

### API (`backend/app/main.py` + `schemas.py`)

Both require the bearer token (reuse `current_identity`); neither consumes scan quota.

- `GET /catalog/categories` → `{ "categories": [{ "category": str, "count": int }] }`
- `GET /catalog/products?category=&grade=&q=&limit=&offset=` → `{ "items": Product[], "total": int }`
  - `grade` validated to one of `A–E` (else ignored). Empty/whitespace `q` ignored.

The product items reuse the exact shape the result screen already consumes (`_to_dict`), so tapping a card needs no extra fetch.

## Frontend

### Navigation refactor (so Back stays coherent)

Replace the ad-hoc `view`/`result`/`compare` state + `navDepth`/`unwindTo` with a single **screen stack** synced to the History API (generalizes the back support already shipped):

- `Screen` (discriminated union): `{t:"home"}` · `{t:"explore"}` · `{t:"history"}` · `{t:"category", category}` · `{t:"scan"}` · `{t:"result", result}` · `{t:"compare", a, b}`. `screens[0]` is always a **tab root** (home/explore/history); the active screen is the top.
- **Tab tap** → reset stack to `[{t: tab}]`.
- **Forward (push)**: explore→category, any→result, result→compare, home→scan. A **successful scan replaces** the `scan` screen with `result` (so Back from a scan's result goes Home, preserving current behavior).
- **Back (pop one)**: pop the top screen; if at a tab root that isn't Home → go to `[{t:"home"}]`; if at Home → exit (don't trap).
- **History sync**: pushing a screen `pushState`; tab switches/scan→result `replaceState`; a single `popstate` listener pops the stack. Encapsulated in a small **pure stack reducer** in `src/session/nav.ts` (replaces the current depth helpers) — unit-tested.

**Resulting Back behavior:**

| On screen | Back goes to |
|---|---|
| Compare | the product you opened it from (Result) |
| Result (from scan) | Home |
| Result (from Explore/History/Home tap) | that opener (Category / History / Home) |
| Category detail | Explore landing |
| Scan | Home |
| Explore / History (tab root) | Home |
| Home | exits app |

### TabBar (`src/components/TabBar.tsx` + `.module.css`)

Persistent bottom bar shown only on the three tab roots (Home/Explore/History) — hidden on Category/Scan/Result/Compare (those have their own back). Three items (icon + label), active tab highlighted (green). `props: { active: "home"|"explore"|"history"; onSelect: (tab) => void }`.

### ExploreScreen (`src/screens/ExploreScreen.tsx` + `.module.css`)

The Explore tab root. State: `query`, `categories`, `searchResults`, `loading`.
- On mount: `GET /catalog/categories` → render a 2-column grid of **category tiles** (color per category, emoji, name, count).
- A **search box** on top. When `query` is non-empty (debounced ~250ms): `GET /catalog/products?q=` → show a flat **results list** (thumbnail, grade, name, `score · category · brand`) instead of tiles; clearing the box restores tiles.
- Tapping a tile → `onOpenCategory(category)` (push CategoryScreen). Tapping a search result → `onOpenProduct(product)`.
- Empty/error states: "No products found" for an empty search; a friendly retry line if the categories request fails.

### CategoryScreen (`src/screens/CategoryScreen.tsx` + `.module.css`)

Pushed when a tile is tapped. Props `{ category, onOpenProduct, onBack }`. State: `grade` (""|A–E, default ""), `items`, `total`, `loading`.
- Header: back arrow + category name + total count.
- **Grade filter** chip row: `All · A · B · C · D · E` (single-select; "All" = no filter). Selecting refetches.
- Fetches `GET /catalog/products?category=<cat>&grade=<grade>&limit=200`; renders a 2-column **product card grid** (image w/ grade badge, name, `score · brand`), healthiest first. Tap a card → `onOpenProduct`.
- Empty state when a grade filter yields nothing ("No A-grade drinks yet").

### API client (`src/api/catalog.ts`)

- `fetchCategories(token): Promise<{ categories: CategoryCount[] }>`
- `fetchCatalogProducts(token, { category?, grade?, q?, limit?, offset? }): Promise<{ items: Product[]; total: number }>`
- Types in `src/api/types.ts`: `interface CategoryCount { category: string; count: number }`.

### App wiring (`src/App.tsx`)

Adopt the screen stack. Render TabBar on tab-root screens; route product taps through the existing `showProduct` (pushes a `result` screen); Explore/Category call the catalog API. History/Home/Scan keep working through the new stack. The Home `onSeeHistory` and the profile menu's History entry now just select the History tab.

## Error handling

- Catalog requests failing (network/500) → inline "Couldn't load — tap to retry" in Explore/Category; never a blank screen.
- A `401` from a catalog call → same `onAuthError`/sign-out path the scan calls use.
- Empty category (count 0) tiles aren't shown (categories endpoint only returns non-empty).
- Missing `image_url` on a card → the same neutral placeholder used on the result/compare screens.

## Testing

**Backend (pytest):**
- `category_counts`: groups & counts, excludes `""`, ordered by count desc.
- `list_products`: filters by category; by grade; by `q` (name and brand, case-insensitive); combined; sorted healthiest-first; `total` vs `limit` paging; `limit` clamp.
- API: `GET /catalog/categories` shape; `GET /catalog/products` with each param; invalid `grade` ignored; requires bearer (401 without).

**Frontend (vitest):**
- `nav.ts` stack reducer: push/pop/tab-reset/scan→result-replace produce the expected stacks and the Back table above (pure, exhaustive).
- `catalog.ts`: builds correct query strings; passes the token.
- `TabBar`: renders three tabs, marks active, calls `onSelect`.
- `ExploreScreen`: renders tiles from a mocked categories response; typing switches to mocked search results; tapping a tile calls `onOpenCategory`.
- `CategoryScreen`: renders a mocked product grid; selecting a grade chip refetches with `grade`; tapping a card calls `onOpenProduct`; empty state shows.

## Deploy

- Backend: VM `git pull` + `docker compose up -d --build --force-recreate` (no migration; read-only endpoints). No reseed needed.
- Frontend: Vercel auto-deploy on push. No new env.

## Notes

- Browsing is auth-gated (bearer) like the rest of the API; it doesn't consume scan quota.
- This is the bigger of the Phase-2 pieces; if the plan grows unwieldy it may be split into a backend plan (catalog API) then a frontend plan (tab bar + nav refactor + Explore/Category) — each independently shippable (backend first).
