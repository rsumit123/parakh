# Compare Products Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile Compare screen that puts the scanned product side-by-side with a chosen "Healthier option" — images, grades/scores, per-nutrient values (better highlighted), and NOVA + India flags.

**Architecture:** Frontend-only; both products are already in hand on the result screen (`result.product` + an entry of `result.alternatives`). A pure helper builds per-nutrient comparison rows; a presentational `CompareScreen` renders the two-column table; the result screen's alternative rows trigger compare; `App.tsx` holds a `compare` state and renders the screen.

**Tech Stack:** React + TypeScript + Vite + Vitest. No backend, env, or migration.

**Spec:** `docs/superpowers/specs/2026-06-02-compare-products-design.md`

---

## File Structure

- Create: `frontend/src/scan/compare.ts` — pure `buildComparison(a,b)` + `kcalFromKj`.
- Create: `frontend/src/scan/compare.test.ts`.
- Create: `frontend/src/screens/CompareScreen.tsx` + `CompareScreen.module.css` + `CompareScreen.test.tsx`.
- Modify: `frontend/src/screens/ResultScreen.tsx` (alternative row → compare; visible Compare pill; new `onCompare` prop) + `ResultScreen.module.css` (Compare pill) + `ResultScreen.test.tsx`.
- Modify: `frontend/src/App.tsx` (compare state + render).

Run frontend tests from `frontend/` with `npm test`; build with `npm run build`.

---

## Task 1: Pure comparison helper

**Files:**
- Create: `frontend/src/scan/compare.ts`
- Test: `frontend/src/scan/compare.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/scan/compare.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildComparison, kcalFromKj } from "./compare";
import type { Product } from "../api/types";

function prod(over: Partial<Product["nutrition"]>): Product {
  return {
    barcode: "x", name: "P", brand: "B", ingredients: [], source: "amazon",
    nutrition: { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, fruit_veg_nuts_pct: 0, ...over },
    score: { overall: 0, grade: "C", verdict: "", positives: [], negatives: [], breakdown: { nutrients: [], india_flags: [] } },
  };
}

describe("kcalFromKj", () => {
  it("converts kJ to rounded kcal", () => {
    expect(kcalFromKj(2326)).toBe(556);
    expect(kcalFromKj(0)).toBe(0);
  });
});

describe("buildComparison", () => {
  it("returns the six nutrient rows in order with units", () => {
    const rows = buildComparison(prod({}), prod({}));
    expect(rows.map((r) => r.key)).toEqual(
      ["energy", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g"]);
    expect(rows[0].unit).toBe("kcal");
    expect(rows[1].unit).toBe("g");
  });

  it("lower wins for high-is-bad nutrients (sugar/sat-fat/salt/energy)", () => {
    const a = prod({ sugars_g: 10, sat_fat_g: 15, salt_g: 2, energy_kj: 2000 });
    const b = prod({ sugars_g: 4, sat_fat_g: 1, salt_g: 0.5, energy_kj: 1500 });
    const rows = buildComparison(a, b);
    const w = Object.fromEntries(rows.map((r) => [r.key, r.winner]));
    expect(w.sugars_g).toBe("b");
    expect(w.sat_fat_g).toBe("b");
    expect(w.salt_g).toBe("b");
    expect(w.energy).toBe("b");
  });

  it("higher wins for fibre and protein", () => {
    const a = prod({ fibre_g: 8, protein_g: 10 });
    const b = prod({ fibre_g: 0, protein_g: 6 });
    const rows = buildComparison(a, b);
    const w = Object.fromEntries(rows.map((r) => [r.key, r.winner]));
    expect(w.fibre_g).toBe("a");
    expect(w.protein_g).toBe("a");
  });

  it("equal values produce no winner", () => {
    const rows = buildComparison(prod({ sugars_g: 5 }), prod({ sugars_g: 5 }));
    expect(rows.find((r) => r.key === "sugars_g")!.winner).toBe("none");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `frontend/`): `npm test -- compare.test.ts`
Expected: FAIL — `./compare` does not exist.

- [ ] **Step 3: Write `compare.ts`**

Create `frontend/src/scan/compare.ts`:

```ts
import type { Product } from "../api/types";

export interface CompareRow {
  key: string;
  label: string;
  unit: string;
  aValue: number;
  bValue: number;
  winner: "a" | "b" | "none";
}

export function kcalFromKj(kj: number): number {
  return Math.round((kj || 0) / 4.184);
}

interface NutrientCfg {
  key: string;
  label: string;
  unit: string;
  higherIsBetter: boolean;
  get: (p: Product) => number;
}

const NUTRIENTS: NutrientCfg[] = [
  { key: "energy", label: "Energy", unit: "kcal", higherIsBetter: false, get: (p) => kcalFromKj(p.nutrition.energy_kj) },
  { key: "sugars_g", label: "Sugar", unit: "g", higherIsBetter: false, get: (p) => p.nutrition.sugars_g },
  { key: "sat_fat_g", label: "Saturated fat", unit: "g", higherIsBetter: false, get: (p) => p.nutrition.sat_fat_g },
  { key: "salt_g", label: "Salt", unit: "g", higherIsBetter: false, get: (p) => p.nutrition.salt_g },
  { key: "fibre_g", label: "Fibre", unit: "g", higherIsBetter: true, get: (p) => p.nutrition.fibre_g },
  { key: "protein_g", label: "Protein", unit: "g", higherIsBetter: true, get: (p) => p.nutrition.protein_g },
];

export function buildComparison(a: Product, b: Product): CompareRow[] {
  return NUTRIENTS.map((n) => {
    const aValue = n.get(a);
    const bValue = n.get(b);
    let winner: "a" | "b" | "none" = "none";
    if (aValue !== bValue) {
      const aBetter = n.higherIsBetter ? aValue > bValue : aValue < bValue;
      winner = aBetter ? "a" : "b";
    }
    return { key: n.key, label: n.label, unit: n.unit, aValue, bValue, winner };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `frontend/`): `npm test -- compare.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/scan/compare.ts frontend/src/scan/compare.test.ts
git commit -m "feat: pure buildComparison helper for product compare"
```

---

## Task 2: CompareScreen component

**Files:**
- Create: `frontend/src/screens/CompareScreen.tsx`
- Create: `frontend/src/screens/CompareScreen.module.css`
- Test: `frontend/src/screens/CompareScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/screens/CompareScreen.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompareScreen } from "./CompareScreen";
import type { Product } from "../api/types";

function make(over: Partial<Product> & { nutrition?: Partial<Product["nutrition"]> }): Product {
  const { nutrition, score, ...rest } = over;
  return {
    barcode: "x", name: "Prod", brand: "Brand", source: "amazon", ingredients: [],
    nutrition: { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, fruit_veg_nuts_pct: 0, ...(nutrition ?? {}) },
    score: { overall: 0, grade: "C", verdict: "", positives: [], negatives: [],
             breakdown: { nutrients: [], india_flags: [], nova: { group: 0, label: "Unknown" } }, ...(score ?? {}) },
    ...rest,
  } as Product;
}

const kurkure = make({
  name: "Kurkure", brand: "PepsiCo", image_url: "https://img/k.jpg",
  nutrition: { energy_kj: 2326, sugars_g: 1.7, sat_fat_g: 15.2, salt_g: 1.7, fibre_g: 0, protein_g: 6.4 },
  score: { overall: 21, grade: "D", verdict: "", positives: [], negatives: [],
           breakdown: { nutrients: [], india_flags: [{ label: "Palm oil", note: "" }], nova: { group: 4, label: "Ultra-processed" } } },
});
const makhana = make({
  name: "Makhana", brand: "Farmley",
  nutrition: { energy_kj: 1600, sugars_g: 1.0, sat_fat_g: 1.0, salt_g: 0.5, fibre_g: 8, protein_g: 10 },
  score: { overall: 82, grade: "A", verdict: "", positives: [], negatives: [],
           breakdown: { nutrients: [], india_flags: [], nova: { group: 1, label: "Minimally processed" } } },
});

describe("CompareScreen", () => {
  it("renders both products' names and grades", () => {
    render(<CompareScreen a={kurkure} b={makhana} onBack={() => {}} />);
    expect(screen.getByText("Kurkure")).toBeInTheDocument();
    expect(screen.getByText("Makhana")).toBeInTheDocument();
    expect(screen.getByText("D")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("marks the better side as winner per nutrient", () => {
    render(<CompareScreen a={kurkure} b={makhana} onBack={() => {}} />);
    // sat fat: makhana (b) is lower → winner
    expect(screen.getByTestId("cell-sat_fat_g-b")).toHaveAttribute("data-winner", "true");
    expect(screen.getByTestId("cell-sat_fat_g-a")).toHaveAttribute("data-winner", "false");
    // fibre: makhana (b) is higher → winner
    expect(screen.getByTestId("cell-fibre_g-b")).toHaveAttribute("data-winner", "true");
  });

  it("shows NOVA + flag chips for the processed product and Clean for the other", () => {
    render(<CompareScreen a={kurkure} b={makhana} onBack={() => {}} />);
    expect(screen.getByText(/NOVA 4/)).toBeInTheDocument();
    expect(screen.getByText("Palm oil")).toBeInTheDocument();
    expect(screen.getByText("Clean")).toBeInTheDocument();
  });

  it("renders a placeholder (no broken img) when a product has no image", () => {
    render(<CompareScreen a={kurkure} b={makhana} onBack={() => {}} />);
    // makhana has no image_url → it must not render an <img> with its name as alt
    expect(screen.queryByAltText("Makhana")).not.toBeInTheDocument();
    // kurkure has an image
    expect(screen.getByAltText("Kurkure")).toBeInTheDocument();
  });

  it("calls onBack when the back button is pressed", async () => {
    const onBack = vi.fn();
    render(<CompareScreen a={kurkure} b={makhana} onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `frontend/`): `npm test -- CompareScreen.test.tsx`
Expected: FAIL — `./CompareScreen` does not exist.

- [ ] **Step 3: Write `CompareScreen.tsx`**

Create `frontend/src/screens/CompareScreen.tsx`:

```tsx
import type { Product } from "../api/types";
import { gradeTone } from "../scan/grade";
import { buildComparison } from "../scan/compare";
import styles from "./CompareScreen.module.css";

interface Props {
  a: Product;
  b: Product;
  onBack: () => void;
}

interface Chip {
  text: string;
  tone: "bad" | "good";
}

function chipsFor(p: Product): Chip[] {
  const out: Chip[] = [];
  const nova = p.score.breakdown.nova;
  if (nova && nova.group >= 3) out.push({ text: `NOVA ${nova.group} · ${nova.label}`, tone: "bad" });
  for (const f of p.score.breakdown.india_flags) out.push({ text: f.label, tone: "bad" });
  if (out.length === 0) out.push({ text: "Clean", tone: "good" });
  return out;
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function ProductHead({ p }: { p: Product }) {
  return (
    <div className={styles.pcard}>
      {p.image_url ? (
        <img className={styles.thumb} src={p.image_url} alt={p.name || "product"} />
      ) : (
        <div className={styles.placeholder} aria-hidden="true">🛒</div>
      )}
      <div className={styles.pn}>{p.name || "Unknown product"}</div>
      <div className={styles.pb}>{p.brand}</div>
      <div className={styles.gline}>
        <span className={`${styles.g} ${styles[gradeTone(p.score.grade)]}`}>{p.score.grade}</span>
        <span className={styles.sc}>{p.score.overall}</span>
      </div>
    </div>
  );
}

export function CompareScreen({ a, b, onBack }: Props) {
  const rows = buildComparison(a, b);
  return (
    <div className={styles.screen}>
      <div className={styles.topbar}>
        <button className={styles.back} onClick={onBack} aria-label="Back">‹</button>
        <span className={styles.title}>Compare</span>
      </div>

      <div className={styles.header}>
        <ProductHead p={a} />
        <ProductHead p={b} />
      </div>

      <div className={styles.rows}>
        {rows.map((r) => (
          <div className={styles.nrow} key={r.key}>
            <div className={styles.nlab}>
              {r.label}{r.unit === "kcal" ? " (kcal/100g)" : ""}
            </div>
            <div className={styles.vals}>
              <div className={styles.cell} data-testid={`cell-${r.key}-a`} data-winner={r.winner === "a"}>
                {fmt(r.aValue)}{r.unit === "kcal" ? "" : r.unit}
                {r.winner === "a" && <span className={styles.tick}>✓</span>}
              </div>
              <div className={styles.cell} data-testid={`cell-${r.key}-b`} data-winner={r.winner === "b"}>
                {fmt(r.bValue)}{r.unit === "kcal" ? "" : r.unit}
                {r.winner === "b" && <span className={styles.tick}>✓</span>}
              </div>
            </div>
          </div>
        ))}

        <div className={styles.nrow}>
          <div className={styles.nlab}>Processing &amp; flags</div>
          <div className={styles.vals}>
            {[a, b].map((p, i) => (
              <div className={styles.chips} key={i}>
                {chipsFor(p).map((c, j) => (
                  <span key={j} className={`${styles.chip} ${c.tone === "bad" ? styles.bad : styles.ok}`}>{c.text}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `CompareScreen.module.css`**

Create `frontend/src/screens/CompareScreen.module.css`:

```css
.screen { min-height: 100dvh; background: var(--paper); color: var(--ink);
  display: flex; flex-direction: column; }
.topbar { display: flex; align-items: center; gap: 8px; padding: 14px 14px 6px; }
.back { font-size: 24px; line-height: 1; color: var(--ink); background: transparent; padding: 0 6px; }
.title { font-size: 16px; font-weight: 800; }

.header { position: sticky; top: 0; z-index: 5; background: var(--paper);
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 4px 14px 12px;
  border-bottom: 1px solid var(--line); }
.pcard { background: var(--card); border: 1px solid var(--line); border-radius: 16px;
  padding: 12px; text-align: center; }
.thumb, .placeholder { width: 56px; height: 56px; border-radius: 12px; margin: 0 auto 8px;
  background: #fff; border: 1px solid var(--line); object-fit: contain; }
.placeholder { display: flex; align-items: center; justify-content: center; font-size: 28px; background: #eef3ec; }
.pn { font-size: 12.5px; font-weight: 700; line-height: 1.2; max-height: 30px; overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.pb { font-size: 10.5px; color: var(--muted); margin-bottom: 8px; }
.gline { display: flex; align-items: center; justify-content: center; gap: 6px; }
.g { width: 26px; height: 26px; border-radius: 8px; color: #fff; font-weight: 800; font-size: 14px;
  display: flex; align-items: center; justify-content: center; }
.g.good { background: var(--green); } .g.ok { background: var(--amber); } .g.bad { background: var(--red); }
.sc { font-size: 13px; font-weight: 800; }

.rows { padding: 6px 14px 28px; }
.nrow { padding: 10px 0; border-bottom: 1px solid var(--line); }
.nlab { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase;
  letter-spacing: .04em; text-align: center; margin-bottom: 6px; }
.vals { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cell { position: relative; text-align: center; font-size: 15px; font-weight: 800;
  padding: 8px 4px; border-radius: 10px; background: #f0efe8; color: var(--ink); }
.cell[data-winner="true"] { background: #e7f6ea; color: var(--green-deep); }
.tick { position: absolute; top: 3px; right: 7px; font-size: 10px; color: var(--green); }
.chips { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; }
.chip { font-size: 9.5px; font-weight: 700; padding: 3px 7px; border-radius: 7px; }
.bad { background: #fde8e5; color: var(--red); }
.ok { background: #e7f6ea; color: var(--green); }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `frontend/`): `npm test -- CompareScreen.test.tsx`
Expected: PASS (all 5).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/screens/CompareScreen.tsx frontend/src/screens/CompareScreen.module.css frontend/src/screens/CompareScreen.test.tsx
git commit -m "feat: CompareScreen two-column product comparison"
```

---

## Task 3: Wire the Compare action into the result screen's alternatives

**Files:**
- Modify: `frontend/src/screens/ResultScreen.tsx:36-45,139-157`
- Modify: `frontend/src/screens/ResultScreen.module.css`
- Test: `frontend/src/screens/ResultScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/screens/ResultScreen.test.tsx`, inside the `describe("ResultScreen", ...)` block (the `product` fixture already exists in this file):

```tsx
  it("compares an alternative when its row is activated", async () => {
    const alt = { ...product, barcode: "alt-1", name: "Makhana", image_url: "https://img/m.jpg" };
    const onCompare = vi.fn();
    render(
      <ResultScreen product={product} alternatives={[alt]} onScanAgain={() => {}} onCompare={onCompare} />,
    );
    expect(screen.getByText(/compare/i)).toBeInTheDocument(); // visible affordance
    await userEvent.click(screen.getByRole("button", { name: /makhana/i }));
    expect(onCompare).toHaveBeenCalledWith(alt);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `frontend/`): `npm test -- ResultScreen.test.tsx`
Expected: FAIL — `onCompare` is not a prop; no "Compare" text.

- [ ] **Step 3: Add the `onCompare` prop**

In `frontend/src/screens/ResultScreen.tsx`, update the `Props` interface (currently lines ~37-42):

```tsx
interface Props {
  product: Product;
  alternatives?: Product[];
  onScanAgain: () => void;
  onOpenProduct?: (p: Product) => void;
  onCompare?: (p: Product) => void;
}
```

And the function signature destructure:

```tsx
export function ResultScreen({ product, alternatives = [], onScanAgain, onOpenProduct, onCompare }: Props) {
```

(`onOpenProduct` stays — it's still used elsewhere, just not by the alternatives row.)

- [ ] **Step 4: Change the alternatives row to compare + add the visible pill**

In `frontend/src/screens/ResultScreen.tsx`, replace the alternatives `.map(...)` block (lines ~139-157) with:

```tsx
            {alternatives.map((a) => (
              <button
                key={a.barcode}
                className={styles.alt}
                onClick={() => onCompare?.(a)}
              >
                {a.image_url && (
                  <img className={styles.altThumb} src={a.image_url} alt={a.name || "product"} />
                )}
                <span className={`${styles.altGrade} ${styles[gradeTone(a.score.grade)]}`}>
                  {a.score.grade}
                </span>
                <span className={styles.altInfo}>
                  <span className={styles.altName}>{a.name || "Unknown product"}</span>
                  <span className={styles.altMeta}>{a.score.overall}/100 · {a.brand || a.category}</span>
                </span>
                <span className={styles.comparePill}>Compare ⇄</span>
              </button>
            ))}
```

- [ ] **Step 5: Style the Compare pill**

In `frontend/src/screens/ResultScreen.module.css`, replace the `.altChev` rule with:

```css
.comparePill { flex-shrink: 0; font-size: 11px; font-weight: 800; color: var(--green-deep);
  background: var(--lime); border-radius: 999px; padding: 6px 10px; white-space: nowrap; }
```

- [ ] **Step 6: Run the test to verify it passes**

Run (from `frontend/`): `npm test -- ResultScreen.test.tsx`
Expected: PASS (all, including the new compare test).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/screens/ResultScreen.tsx frontend/src/screens/ResultScreen.module.css frontend/src/screens/ResultScreen.test.tsx
git commit -m "feat: alternatives row opens Compare with a visible Compare pill"
```

---

## Task 4: Render CompareScreen from App

**Files:**
- Modify: `frontend/src/App.tsx:1-10,14-20,48-60`

- [ ] **Step 1: Import CompareScreen and add compare state**

In `frontend/src/App.tsx`, add the import near the other screen imports (after the `ResultScreen` import):

```tsx
import { CompareScreen } from "./screens/CompareScreen";
```

Inside `Shell()`, add a compare state next to the other `useState` hooks (after the `history` state line):

```tsx
  const [compare, setCompare] = useState<{ a: Product; b: Product } | null>(null);
```

- [ ] **Step 2: Render CompareScreen (takes precedence over the result view)**

In `frontend/src/App.tsx`, immediately BEFORE the existing `if (result) {` block, add:

```tsx
  if (compare) {
    return <CompareScreen a={compare.a} b={compare.b} onBack={() => setCompare(null)} />;
  }
```

Then in the existing `if (result)` block, pass `onCompare` to `ResultScreen`:

```tsx
        <ResultScreen
          product={result.product}
          alternatives={result.alternatives ?? []}
          onOpenProduct={showProduct}
          onCompare={(alt) => setCompare({ a: result.product, b: alt })}
          onScanAgain={() => { setResult(null); setView("home"); }}
        />
```

- [ ] **Step 3: Verify the app test still passes**

Run (from `frontend/`): `npm test -- App.test.tsx`
Expected: PASS (no regression; compare flow isn't exercised by existing tests).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: render CompareScreen from result screen compare action"
```

---

## Task 5: Full verification + deploy

**Files:** none (verify + deploy)

- [ ] **Step 1: Full frontend suite**

Run (from `frontend/`): `npm test`
Expected: all test files pass, `0 failed`.

- [ ] **Step 2: Typecheck + build**

Run (from `frontend/`): `npm run build`
Expected: `tsc -b` + `vite build` succeed (no type errors — confirms the new props/types compile).

- [ ] **Step 3: Commit any fixes (only if Steps 1–2 required them)**

```bash
git add -A && git commit -m "test: fixes from compare verification"
```

- [ ] **Step 4: Push (Vercel auto-deploys the frontend)**

```bash
git push origin main
```

- [ ] **Step 5: Confirm the Vercel deployment is READY**

Check that the latest production deployment for the pushed commit reaches state `READY` (via the Vercel deployments list). Then on `https://parakh.skdev.one`: scan a product that has Healthier options, confirm each option shows a "Compare ⇄" pill, tap one, and verify the two-column compare screen renders with both images, grades, highlighted winners, and flags; back returns to the result.
