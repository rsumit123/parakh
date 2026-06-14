# Multi-Item Meal Estimation — Design

**Goal:** Make the "snap a meal" feature handle plates with several dishes (thali/combo) by
estimating each dish separately, letting the user edit the list, and logging the plate as
**one combined daily entry**.

**Why:** Measured on real thali photos, the single-dish estimator under-counts multi-dish
plates 2–4× (logs only one dish). A combined-blob prompt over-counts and isn't user-correctable.
Itemized estimates play to the model's strength (it estimates single dishes well) and let the
user fix/remove rows before they count.

**Decision (locked with user):** log the whole plate as **one** `FoodLogEntry` with summed macros
(not one entry per dish). No per-dish breakdown is persisted in v1.

---

## Backend

### `app/services/meal_estimator.py`
- **Prompt** changes to: identify EVERY distinct dish on the plate and return them as a list;
  for each dish give a specific name + ONE-serving portion_g + per-100g (the existing per-serving
  anchors stay). A single dish → a one-element list.
- **`estimate()` returns** `{"items": [{"name": str, "portion_g": float, "per100g": {6 macros}}, ...]}`
  (was `{name, portion_g, per100g}`). Each item's `portion_g` runs through the existing
  `_clamp_portion(name, portion)` per item. If the model returns no usable items, fall back to a
  single `{"name": "Meal", "portion_g": 200, "per100g": zeros}` item so the caller always gets ≥1.
- Schema/parse: read `data["items"]` (list of objects); tolerate a legacy single-object shape by
  wrapping it. Each item: name default "Item", portion default 200, per100g via `_per100g`.

### `POST /diet/estimate` (`app/main.py`)
- Returns the estimator output directly: `{"items": [...]}`. (Drop the old top-level `grade` — it
  was unused by the UI.)
- Auth/quota unchanged (`current_user`, `_ensure_quota`/`_consume`, 422 on `MealEstimateError`,
  503 if estimator is None).

### `/diet/log` — UNCHANGED
The combined entry is logged through the existing endpoint: the frontend sends
`kind="unpackaged"`, `name=<meal name>`, `quantity_g=<total grams>`, and a **synthesized**
`per100g = total_macros × 100 / total_grams`, so the server's `macros = per100g × qty/100`
reproduces the summed macros exactly. No new column, no new route.

---

## Frontend

### `src/api/diet.ts`
- New type `MealItem = { name: string; portion_g: number; per100g: Macros }`.
- `MealEstimate` becomes `{ items: MealItem[] }`.
- `estimateMeal(token, file): Promise<MealEstimate>` (shape only changes).

### `src/session/nav.ts`
- `confirmMeal` screen payload carries the estimate: `{ t: "confirmMeal"; estimate: MealEstimate }`
  (drop the nullable single-estimate + `imageUrl`; manual path is already gone, estimate always ≥1 item).

### `src/screens/MealCaptureScreen.tsx`
- `onEstimated(estimate: MealEstimate)` (was a single estimate); passes the `{items}` object on.

### `src/screens/ConfirmMealScreen.tsx` — reworked to a list editor
Props: `{ estimate: MealEstimate; onConfirm: (body: LogBody) => void; onBack }`.
State: a working copy of the items (each with an editable `name` and `grams`), plus an editable
**meal name** (only shown when >1 item; for 1 item the entry name = the single item's name).
- **Single item (`items.length === 1`):** keep today's rich editor — editable name, the
  Small / "1 plate"|"1 glass" / Large chips (drink-aware via `isLiquid`), grams input with ml/g
  unit, live "Counts" preview.
- **Multiple items:** an editable meal-name field at top, then one compact row per dish —
  `[editable name] [grams input + ml/g unit] [✕ remove]` — and a **running total**
  ("Total: N kcal · Xg protein · Yg sugar"). Remove is disabled when only one row remains.
  No "add item" (a blank row would contribute zero macros).
- **Confirm:** compute `total = Σ portionMacros(item.per100g, item.grams)` and
  `totalGrams = Σ item.grams`; `per100g = totalGrams>0 ? scale(total, 100/totalGrams) : zeros`;
  call `onConfirm({ kind: "unpackaged", name: mealName, quantity_g: totalGrams, per100g })`.
  `mealName` = the single item's name (1 item) or the editable meal name (default "Thali" or
  `"<first> + <n-1> more"`).

### `src/App.tsx`
- `confirmMeal` branch passes `estimate={cur.estimate}`; the `onConfirm` logs via `addLog` then
  navigates to Today (unchanged). MealCapture→confirmMeal nav unchanged (replace-base).

---

## Testing
- **Backend:** `estimate()` parses a multi-item response into `items` (each clamped); single-object
  legacy shape wraps to one item; empty/garbage → one fallback item. `/diet/estimate` returns
  `{items:[...]}`.
- **Frontend:** ConfirmMealScreen — single-item path still confirms with the right `quantity_g`;
  multi-item path sums macros into the synthesized per100g and logs one entry with the meal name;
  removing a row updates the running total; the combined `quantity_g` equals the sum of grams.

## Build order (each shippable)
1. Backend estimator → items array + per-item clamp + prompt; update tests.
2. `/diet/estimate` returns `{items}`; update api test.
3. Frontend types + nav + MealCaptureScreen passthrough.
4. ConfirmMealScreen list editor + combined logging; App wiring.

## Out of scope (v2)
Per-dish breakdown persisted on the entry (drill-down view); "add a missed dish" with manual macros.
