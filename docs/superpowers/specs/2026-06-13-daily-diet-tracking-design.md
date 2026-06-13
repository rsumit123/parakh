# Daily Diet Tracking ("WHOOP for food") — v1 Design

**Goal:** Turn Parakh from an occasional "is this product healthy?" lookup into a
daily-habit app. After any scan — or by snapping an unpackaged meal — the user adds
the food to **Today**; we aggregate the day's macros against personal targets and
surface what they're low on / over on.

**Status:** design approved in brainstorming (incl. HTML mockup at
`docs/mockups/diet-tracking-mockup.html`). This spec is the contract for the
implementation plan.

---

## 1. Scope

**In (v1 — the habit loop):**
- "Add to today" from any packaged scan (barcode or label photo).
- "Snap a meal" → vision model pre-fills name + portion + macros → user confirms → logged.
- Manual add (minimal escape hatch).
- A **Today** screen: headline gaps + per-macro progress vs targets + today's log (with delete).
- **Smart default targets**, overridable in a targets/profile settings screen.
- Tracking is **gated to signed-in (Google) users**.

**Out (deferred to v2 — explicitly not built now):**
- Multi-day history, trends, charts, streaks, weekly insights.
- Micronutrients (iron, calcium, B12, vitamin D, …) — v1 tracks only the 6 macros we
  already extract.
- Guest tracking + guest→account migration.
- Water/hydration, meal timing, barcodes-less "recent foods" library.
- Center floating-＋ nav; promoting Today to the landing screen.

**Locked decisions (from brainstorming):**
| Decision | Choice |
|---|---|
| v1 ambition | Habit-loop MVP |
| Nutrients tracked | The 6 macros we already have: energy, protein, fibre, sugar, sat-fat, salt |
| Targets | Smart defaults out of the box + manual override in settings/profile |
| Accounts | Tracking requires Google sign-in; data tied to the user account |
| Unpackaged | Photo → pre-filled estimate → user confirms (editable name + portion) |
| Packaged portion | Serving size + ½ / 1 / 2 chips + editable grams |
| Nav | "Today" as a 4th bottom tab; "Add food" button inside Today |

---

## 2. Architecture overview

A **food log**. Every logged food is one immutable `FoodLogEntry` stamped with a
local date. The Today screen reads the day's entries, sums the 6 macros, compares to
targets via a pure function, and renders status. Packaged and unpackaged share the
same log + the same macro math (`per-100g × quantity_g / 100`); they differ only in
how the per-100g values and portion are obtained.

```
Packaged scan ─┐                       ┌─ GET /diet/day → totals vs targets → Today UI
Meal snap ─────┼─→ confirm portion ─→ POST /diet/log ─┤
Manual ────────┘                       └─ DELETE /diet/log/{id}
```

All new backend code lives under existing patterns: `app/models.py`,
`app/repositories/diet.py` (new), `app/services/` (new estimator), `app/routers/`
(new `diet` router), `app/nutrition/targets.py` (new pure module).

---

## 3. Data model

### 3.1 `FoodLogEntry` (new table)
| field | type | notes |
|---|---|---|
| `id` | int PK | |
| `identity` | str, indexed | the signed-in user identity (`user:<id>`) |
| `day` | str | local date `YYYY-MM-DD` (client sends its local day) |
| `created_at` | datetime | |
| `kind` | str | `packaged` \| `unpackaged` \| `manual` |
| `barcode` | str, nullable | reference to the source product (packaged) |
| `name` | str | display name (snapshot) |
| `brand` | str | snapshot |
| `quantity_g` | float | grams consumed |
| `energy_kj` `sugars_g` `sat_fat_g` `salt_g` `fibre_g` `protein_g` | float | **frozen macro snapshot** = per-100g × quantity_g/100 |
| `image_url` | str | optional (meal snaps) |

**Why a frozen snapshot:** an entry is an immutable record of what was counted. If a
product's data later changes, past days don't silently shift.

### 3.2 `Profile` (new table, one row per user — created lazily)
`identity` (PK/unique), `sex` (nullable), `age` (nullable), `weight_kg` (nullable),
`activity` (nullable: sedentary/moderate/active), `goal` (nullable), and
`target_overrides` (JSON, nullable — explicit per-macro overrides). All optional;
absence = smart defaults.

### 3.3 `Product` gains `serving_size_g` (nullable float)
Parsed from OpenFoodFacts `serving_size` (regex for `g`/`ml`) in the OFF client and,
where available, from extraction. When null, the portion sheet falls back to a
per-category default (a small constant map, e.g. drink 200, biscuit 25, chips 30,
namkeen 30, chocolate 20, …). Added via the existing `_ADDED_COLUMNS` lightweight
migration in `db.py`.

---

## 4. Targets & status (pure module `app/nutrition/targets.py`)

`compute_targets(profile) -> Targets` returns the 6 daily targets.

**Smart adult defaults (unisex, used when profile empty):**
| macro | target | kind |
|---|---|---|
| energy | 2000 kcal (8368 kJ) | limit |
| protein | 50 g | hit |
| fibre | 30 g | hit |
| sugar (total) | 50 g | limit |
| sat fat | 22 g | limit |
| salt | 5 g | limit |

When profile fields are present, refine: energy via Mifflin–St Jeor × activity;
protein ≈ 0.8–1.0 g/kg; sugar/salt/sat-fat stay guideline caps. `target_overrides`
always win over computed values, per macro.

`day_status(totals, targets) -> {per_macro: 'low'|'ok'|'over', headline: str}`:
- **hit** macros (protein, fibre): `consumed < target` → `low`, else `ok`.
- **limit** macros (energy, sugar, sat fat, salt): `consumed > target` → `over`, else `ok`.
- `headline`: compose from the `low` hits + `over` limits, e.g. *"You're low on fibre
  & protein, and over on sugar."* Empty-day and all-good states have friendly copy.

Both functions are pure and unit-tested; no DB or time dependency (the caller passes
totals).

---

## 5. Backend API (new `diet` router, all require a signed-in user)

A new dependency `current_user` resolves the token to a real user and **401s guests**
(reuses the existing `user:<id>` token scheme; guest device tokens are rejected).

| method · path | body / params | returns |
|---|---|---|
| `POST /diet/log` | `{kind, barcode?, name, brand?, quantity_g, per100g?{6 macros}, image_url?, day}` | the created entry + the day's updated totals |
| `GET /diet/day` | `?date=YYYY-MM-DD` | `{date, entries[], totals{6}, targets{6}, status{per-macro}, headline}` |
| `DELETE /diet/log/{id}` | — | `{ok, totals}` (entry must belong to caller) |
| `POST /diet/estimate` | `{image}` (multipart) | `{name, portion_g, per100g{6 macros}, grade?, image_url?}` — **does not log** |
| `GET /diet/profile` | — | `{profile, effective_targets{6}}` |
| `PUT /diet/profile` | `{sex?, age?, weight_kg?, activity?, goal?, target_overrides?}` | updated profile + `effective_targets` |

**Macro math (one rule everywhere):** the server stores `entry.<macro> = per100g.<macro>
× quantity_g / 100`.
- **Packaged** (`barcode` given): server looks up the product and uses its stored
  per-100g — the client need not send macros.
- **Unpackaged / manual**: client sends `per100g` (from `/diet/estimate`, or manual
  entry); `quantity_g` is the confirmed portion.

This keeps re-scaling trivial: changing the portion just changes `quantity_g`; macros
recompute from the same per-100g basis.

---

## 6. Meal estimator (`app/services/meal_estimator.py`)

Reuses the OpenRouter vision pattern from the label extractor (swappable model via
`PARAKH_VISION_MODEL`). Prompt: identify the Indian dish(es) in the photo, estimate
the **total grams** on the plate, and return the **6 macros per 100 g** plus a concise
dish **name**. Schema-validated (same discipline as catalog extraction). The service
returns `{name, portion_g, per100g}`; we also run the existing scorer on the per-100g
values to attach a grade for display.

**Cost/quota:** each estimate is one vision call. v1 counts `/diet/estimate` against
the user's existing daily scan quota (free tier) so cost is bounded; revisit a
dedicated diet quota in v2. Failures degrade gracefully to the **manual** add path
(user types name + rough macros), so the loop never hard-fails.

---

## 7. Frontend (React + TS, existing patterns)

**Nav:** add `today` to the `Screen` union and the `TabBar` (`Home · Explore · Today ·
History`, 📊 icon) in `src/session/nav.ts` + `TabBar`. Guests tapping **Today** or
**Add to today** get the existing sign-in modal.

**New / changed screens & components:**
- **`TodayScreen`** — fetches `GET /diet/day`; renders headline flag → 6 macro
  progress rows (low/over/ok tags) → today's log list (tap 🗑 to delete) → **"＋ Add
  food"** → chooser (Scan packaged · Snap a meal · Add manually). ⚙︎ → targets settings.
- **`PortionSheet`** (component) — serving + ½/1/2 chips + editable grams + live "this
  counts" preview; used by the packaged add path. Pure helper `portionMacros(per100g,
  grams)`.
- **`ResultScreen`** — add the lime **"＋ Add to today"** button directly under the
  score; opens `PortionSheet` → `POST /diet/log` with the product barcode.
- **Meal-snap flow** — camera → `POST /diet/estimate` → **`ConfirmMealScreen`**
  (editable name, portion segment + grams that **re-scale macros live**, macro chips) →
  **"Add to today"** → `POST /diet/log`. No "AI"/"estimate" language surfaced; copy is
  *"Confirm meal"* / *"Check the name & portion."*
- **`TargetsSettings`** — reachable from Today ⚙︎ and the profile dropdown; `GET/PUT
  /diet/profile`; shows effective targets with per-macro override inputs.

**API client:** `src/api/diet.ts` (logDay, addLog, deleteLog, estimateMeal,
getProfile, putProfile).

---

## 8. Testing

**Backend (pytest):** `compute_targets` (defaults + profile refine + overrides);
`day_status` (low/over/ok + headline copy incl. empty/all-good); log CRUD + ownership;
day aggregation totals; `current_user` rejects guests (401); meal estimator with a
**mocked** vision response (schema + scorer); OFF `serving_size` parse; per-category
serving fallback.

**Frontend (vitest):** `portionMacros` math; `TodayScreen` render states (empty / with
entries / over-target); `PortionSheet` chip↔grams sync; `ConfirmMealScreen` live
re-scale; nav adds Today + guest gating; delete updates totals.

---

## 9. Build sequence (within v1)

1. **Backend core** — models + migration, `targets.py`, `current_user` guard,
   `POST/GET/DELETE /diet/log`, `GET /diet/day`. (TDD.)
2. **Packaged loop end-to-end** — Today tab + `PortionSheet` + "Add to today" on
   ResultScreen. **The daily loop is usable after this step** (packaged only).
3. **Meal snap** — `/diet/estimate` + `ConfirmMealScreen` + camera entry.
4. **Targets settings** — `/diet/profile` + `TargetsSettings` screen.
5. **Serving size** — `Product.serving_size_g` + OFF parse + per-category defaults
   (improves the portion default; the loop works with category defaults before this).

Each step leaves the app shippable.

---

## 10. Risks & mitigations
- **Estimate accuracy** → never auto-log; always a confirm step with editable
  name/portion; manual fallback on failure; no "AI guessed" language (keeps trust).
- **Cost** → estimates share the existing scan quota in v1.
- **Target correctness** → defaults are conservative guideline values; users can
  override; v1 deliberately avoids medical/micronutrient claims.
- **Nav/back-stack regressions** → Today is a tab root (pops to home), consistent with
  the existing stack model in `nav.ts`.
