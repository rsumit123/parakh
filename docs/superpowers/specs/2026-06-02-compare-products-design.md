# Compare Products — Design Spec

**Date:** 2026-06-02
**Status:** Approved (design), pending implementation plan

## Goal

Let a user compare the scanned product against one of its "Healthier options" on a dedicated mobile screen: both product images, grades/scores, a side-by-side value for every nutrient (with the better one highlighted), and each product's processing (NOVA) + India flags.

## Why

The result screen already suggests healthier same-category alternatives, but a user can't see *how* an alternative is better without opening each separately and remembering numbers. A side-by-side compare answers "is this swap worth it?" in one screen.

## Scope

**In scope (frontend only — no backend/API change):**
- A "Compare" affordance on each Healthier-options row → opens a Compare screen (scanned product vs that alternative).
- A new `CompareScreen` using the approved **two-column table** layout.
- A pure helper that turns two `Product`s into comparison rows with a per-nutrient winner.

**Out of scope:** comparing more than two products; comparing arbitrary/unrelated products (only scanned-vs-its-alternative); ingredient-list diffing; any backend change.

## Data (already available, no fetch)

Both products are already in hand on the result screen: `result.product` (scanned) and each entry of `result.alternatives` (from `find_better_in_category`, which returns the full `_to_dict`). Each `Product` has: `name`, `brand`, `image_url?`, `score.overall`, `score.grade`, `score.breakdown.nova` (`{group,label}`), `score.breakdown.india_flags` (`[{label,note}]`), and `nutrition` (`energy_kj, sugars_g, sat_fat_g, salt_g, fibre_g, protein_g, fruit_veg_nuts_pct`).

## UX

### Result screen — Healthier options row (modified)
Each alternative row's **whole row tap = Compare** (changed from "open product"). The row keeps thumbnail + name + score/meta, and gains a **visible "Compare ⇄" button/pill on the right** as the affordance (so it reads as tappable, and signals the action is compare). The row calls a new `onCompare(alternative)` prop. (The existing `onOpenProduct` prop stays for other screens — history, etc. — but is no longer wired to the alternatives row.)

### Compare screen (layout A — two-column table)
- **Sticky header** (stays while nutrient rows scroll): two equal columns, each = product image (rounded, `object-fit:contain`; a neutral placeholder tile when `image_url` is empty), product name (clamped to 2 lines), brand, and a grade pill + 0–100 score. Left column = scanned product, right = alternative.
- **Nutrient rows**, one per nutrient, each showing the label and both values in two cells; the **better cell is tinted green with a ✓**:
  - Energy — shown in **kcal/100g** (`round(energy_kj / 4.184)`), lower is better.
  - Sugar (`sugars_g`), Saturated fat (`sat_fat_g`), Salt (`salt_g`) — grams, lower is better.
  - Fibre (`fibre_g`), Protein (`protein_g`) — grams, higher is better.
- **Processing & flags row** (per column, one chip set): collect a NOVA chip only when `nova.group ≥ 3` (`NOVA 4 · Ultra-processed` = red; `NOVA 3 · Processed` = amber) plus a red chip for each `india_flags[].label`. If that yields **no** chips (group < 3 and no flags), show a single green **"Clean"** chip. (Mirrors the result screen, which also surfaces NOVA only at group ≥ 3.)
- **Top bar**: back arrow → returns to the result screen.

### Winner logic
For each nutrient: compare the two numeric values; the side that is better (lower for high-is-bad nutrients energy/sugar/sat-fat/salt; higher for fibre/protein) gets the green/✓ highlight. **Equal values → neither highlighted.** Encoded in a fixed nutrient config (key, label, unit, `higherIsBetter`).

## Components

- **`frontend/src/scan/compare.ts`** — pure helper `buildComparison(a: Product, b: Product): CompareRow[]` returning, per nutrient, `{ key, label, unit, aValue, bValue, winner: "a" | "b" | "none" }`. Plus `kcalFromKj(kj)`. No React, fully unit-testable.
- **`frontend/src/screens/CompareScreen.tsx`** + **`CompareScreen.module.css`** — presentational; props `{ a: Product; b: Product; onBack: () => void }`. Renders the header, maps `buildComparison(a,b)` to rows, and renders the processing/flags row from each product's `score.breakdown`.
- **`frontend/src/screens/ResultScreen.tsx`** — alternatives row: row tap → `onCompare(a)`; add the visible "Compare ⇄" button; add `onCompare?: (p: Product) => void` to `Props`.
- **`frontend/src/App.tsx`** — add `const [compare, setCompare] = useState<{a: Product; b: Product} | null>(null)`. ResultScreen gets `onCompare={(alt) => setCompare({ a: result.product, b: alt })}`. When `compare` is set, render `<CompareScreen a={compare.a} b={compare.b} onBack={() => setCompare(null)} />` (takes visual precedence over the result view; back returns to the result, which is still in state).

## Error handling / edge cases

- **Missing image** (`image_url` empty/undefined) → neutral placeholder tile (e.g. a muted box with a 🛒/leaf glyph), never a broken `<img>`.
- **Missing/low `nova`** (group < 3 or undefined) → no NOVA chip; if also no flags, show "Clean".
- **Equal nutrient values** → no highlight on either side.
- **Long names** → clamped to 2 lines (CSS `line-clamp`).
- Back button always returns to the result screen with its alternatives intact.

## Testing

**`compare.ts` (vitest, pure):**
- `kcalFromKj(2326)` ≈ 556 (rounded).
- `buildComparison`: lower sugar/sat-fat/salt/energy → that side wins; higher fibre/protein → that side wins; equal value → `"none"`; returns all six nutrient rows in order with correct units.

**`CompareScreen.test.tsx` (vitest + RTL):**
- Renders both product names and both grades.
- A nutrient row shows both values and applies the winner class to the better side (assert via the ✓/class on the expected cell).
- Renders a NOVA chip and an India-flag chip for a flagged product; renders "Clean" for an unflagged NOVA-1 product.
- Renders the placeholder (no broken img) when a product has no `image_url`.
- Back button calls `onBack`.

**`ResultScreen.test.tsx` (update):**
- An alternatives row renders a visible "Compare" control and calls `onCompare` with that alternative when the row is activated.

## Notes

- Frontend-only; ships via the normal Vercel auto-deploy on push to `main`. No new env, no backend, no migration.
