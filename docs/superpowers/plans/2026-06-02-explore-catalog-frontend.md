# Explore Catalog — Frontend (Phase 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Bottom tab bar (Home·Explore·History), Explore tiles + search, Category grid + grade filter, all backed by the catalog API, with a screen-stack navigation that keeps the device Back button coherent.

**Architecture:** Replace the ad-hoc `view/result/compare` + depth helpers with a serializable **screen stack** stored in `history.state` (back = restore previous stack). New `catalog.ts` API client, `TabBar`, `ExploreScreen`, `CategoryScreen`. Frontend-only.

**Tech Stack:** React + TS + Vite + Vitest.

**Spec:** `docs/superpowers/specs/2026-06-02-explore-catalog-design.md`. **Backend (done):** `GET /catalog/categories`, `GET /catalog/products`.

---

## File Structure
- Rewrite: `src/session/nav.ts` (+ `nav.test.ts`) — screen-stack model (replaces navDepth/unwindTo).
- Create: `src/api/catalog.ts` (+ `catalog.test.ts`) — fetchCategories/fetchCatalogProducts.
- Modify: `src/api/types.ts` — add `CategoryCount`.
- Create: `src/components/TabBar.tsx` + `.module.css` (+ `TabBar.test.tsx`).
- Create: `src/screens/ExploreScreen.tsx` + `.module.css` (+ test).
- Create: `src/screens/CategoryScreen.tsx` + `.module.css` (+ test).
- Rewrite: `src/App.tsx` — stack-driven navigation + render.

---

## Task 1: Screen-stack nav model (rewrite `nav.ts`)

**Files:** Rewrite `src/session/nav.ts`; rewrite `src/session/nav.test.ts`.

- [ ] **Step 1: Replace `nav.test.ts`** with stack tests:

```ts
import { describe, it, expect } from "vitest";
import { push, pop, selectTab, pushResultFromScan, top, activeTab, isTabRoot, type Stack } from "./nav";
import type { ScanResult, Product } from "../api/types";

const prod = { barcode: "x", name: "P", brand: "B", ingredients: [], source: "amazon",
  nutrition: { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, fruit_veg_nuts_pct: 0 },
  score: { overall: 1, grade: "C", verdict: "", positives: [], negatives: [], breakdown: { nutrients: [], india_flags: [] } } } as Product;
const result = { source: "db", remaining: 5, product: prod } as ScanResult;

describe("nav stack", () => {
  it("push/pop", () => {
    const s: Stack = [{ t: "explore" }];
    const s2 = push(s, { t: "category", category: "drinks" });
    expect(top(s2)).toEqual({ t: "category", category: "drinks" });
    expect(pop(s2)).toEqual([{ t: "explore" }]);
  });
  it("pop at a non-home tab root goes home", () => {
    expect(pop([{ t: "explore" }])).toEqual([{ t: "home" }]);
  });
  it("pop at home stays home", () => {
    expect(pop([{ t: "home" }])).toEqual([{ t: "home" }]);
  });
  it("selectTab resets the stack to that tab", () => {
    expect(selectTab([{ t: "explore" }, { t: "category", category: "x" }], "history")).toEqual([{ t: "history" }]);
  });
  it("scan result replaces the scan screen (back from it skips the camera)", () => {
    const s: Stack = [{ t: "home" }, { t: "scan" }];
    const s2 = pushResultFromScan(s, result);
    expect(s2).toEqual([{ t: "home" }, { t: "result", result }]);
    expect(pop(s2)).toEqual([{ t: "home" }]);
  });
  it("activeTab/isTabRoot", () => {
    expect(activeTab([{ t: "explore" }, { t: "category", category: "x" }])).toBe("explore");
    expect(isTabRoot({ t: "category", category: "x" })).toBe(false);
    expect(isTabRoot({ t: "home" })).toBe(true);
  });
});
```

- [ ] **Step 2: Run → fail.** `npm test -- nav.test.ts` (old exports gone).

- [ ] **Step 3: Replace `src/session/nav.ts`:**

```ts
import type { ScanResult, Product } from "../api/types";

export type Tab = "home" | "explore" | "history";
export type Screen =
  | { t: "home" } | { t: "explore" } | { t: "history" }
  | { t: "category"; category: string }
  | { t: "scan" }
  | { t: "result"; result: ScanResult }
  | { t: "compare"; a: Product; b: Product };
export type Stack = Screen[]; // stack[0] is always a tab root

export function top(stack: Stack): Screen { return stack[stack.length - 1]; }
export function activeTab(stack: Stack): Tab { return stack[0].t as Tab; }
export function isTabRoot(s: Screen): boolean {
  return s.t === "home" || s.t === "explore" || s.t === "history";
}
export function push(stack: Stack, screen: Screen): Stack { return [...stack, screen]; }
export function selectTab(_stack: Stack, tab: Tab): Stack { return [{ t: tab }]; }
export function pushResultFromScan(stack: Stack, result: ScanResult): Stack {
  const base = top(stack).t === "scan" ? stack.slice(0, -1) : stack;
  return [...base, { t: "result", result }];
}
export function pop(stack: Stack): Stack {
  if (stack.length > 1) return stack.slice(0, -1);
  return stack[0].t === "home" ? stack : [{ t: "home" }];
}
```

- [ ] **Step 4: Run → pass.** **Step 5: Commit** `feat: screen-stack nav model`.

---

## Task 2: Catalog API client

**Files:** Create `src/api/catalog.ts` + `catalog.test.ts`; modify `src/api/types.ts`.

- [ ] **Step 1: `catalog.test.ts`:**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchCategories, fetchCatalogProducts } from "./catalog";

afterEach(() => vi.restoreAllMocks());

function stub(json: unknown) {
  const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => json });
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("catalog api", () => {
  it("fetchCategories sends token and returns categories", async () => {
    const spy = stub({ categories: [{ category: "drinks", count: 90 }] });
    const out = await fetchCategories("tok");
    expect(out.categories[0].category).toBe("drinks");
    expect(spy.mock.calls[0][0]).toContain("/catalog/categories");
    expect(spy.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });
  it("fetchCatalogProducts builds query from params", async () => {
    const spy = stub({ items: [], total: 0 });
    await fetchCatalogProducts("tok", { category: "drinks", grade: "A", limit: 200 });
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("/catalog/products?");
    expect(url).toContain("category=drinks");
    expect(url).toContain("grade=A");
    expect(url).toContain("limit=200");
  });
  it("fetchCatalogProducts omits blank params and encodes q", async () => {
    const spy = stub({ items: [], total: 0 });
    await fetchCatalogProducts("tok", { q: "amul oats" });
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("q=amul%20oats");
    expect(url).not.toContain("category=");
    expect(url).not.toContain("grade=");
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Add `CategoryCount` to `src/api/types.ts`** (after the `Product` interface):

```ts
export interface CategoryCount {
  category: string;
  count: number;
}
```

- [ ] **Step 4: Create `src/api/catalog.ts`:**

```ts
import { fetchJson } from "./client";
import type { CategoryCount, Product } from "./types";

export function fetchCategories(token: string): Promise<{ categories: CategoryCount[] }> {
  return fetchJson<{ categories: CategoryCount[] }>("/catalog/categories", { token });
}

export interface CatalogQuery {
  category?: string;
  grade?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export function fetchCatalogProducts(
  token: string,
  params: CatalogQuery,
): Promise<{ items: Product[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.category) qs.set("category", params.category);
  if (params.grade) qs.set("grade", params.grade);
  if (params.q && params.q.trim()) qs.set("q", params.q.trim());
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  return fetchJson<{ items: Product[]; total: number }>(`/catalog/products?${qs.toString()}`, { token });
}
```

- [ ] **Step 5: Run → pass.** **Step 6: Commit** `feat: catalog API client`.

---

## Task 3: TabBar component

**Files:** Create `src/components/TabBar.tsx` + `.module.css` + `TabBar.test.tsx`.

- [ ] **Step 1: `TabBar.test.tsx`:**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabBar } from "./TabBar";

describe("TabBar", () => {
  it("renders three tabs and marks the active one", () => {
    render(<TabBar active="explore" onSelect={() => {}} />);
    for (const t of ["Home", "Explore", "History"]) expect(screen.getByText(t)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /explore/i })).toHaveAttribute("aria-current", "page");
  });
  it("calls onSelect", async () => {
    const onSelect = vi.fn();
    render(<TabBar active="home" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /history/i }));
    expect(onSelect).toHaveBeenCalledWith("history");
  });
});
```

- [ ] **Step 2: Run → fail. Step 3: Create `TabBar.tsx`:**

```tsx
import type { Tab } from "../session/nav";
import styles from "./TabBar.module.css";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "explore", label: "Explore", icon: "🔍" },
  { id: "history", label: "History", icon: "🕘" },
];

export function TabBar({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  return (
    <nav className={styles.bar}>
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`${styles.tab} ${active === t.id ? styles.on : ""}`}
          aria-current={active === t.id ? "page" : undefined}
          onClick={() => onSelect(t.id)}
        >
          <span className={styles.icon}>{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Create `TabBar.module.css`:**

```css
.bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 50; display: flex;
  background: var(--card); border-top: 1px solid var(--line);
  padding-bottom: env(safe-area-inset-bottom, 0); }
.tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 9px 0 11px; font-size: 10.5px; font-weight: 700; color: var(--muted); background: transparent; }
.icon { font-size: 18px; line-height: 1; }
.on { color: var(--green); }
```

- [ ] **Step 5: Run → pass. Step 6: Commit** `feat: TabBar component`.

Note: screens shown WITH the tab bar must add bottom padding so content isn't hidden behind it — handled in App (Task 6) by wrapping tab-root screens in a container with `padding-bottom: 64px`.

---

## Task 4: ExploreScreen (tiles + search)

**Files:** Create `src/screens/ExploreScreen.tsx` + `.module.css` + test.

- [ ] **Step 1: `ExploreScreen.test.tsx`:**

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExploreScreen } from "./ExploreScreen";
import * as catalog from "../api/catalog";

afterEach(() => vi.restoreAllMocks());

const prod = (over: object) => ({ barcode: "b", name: "N", brand: "Br", source: "amazon", ingredients: [],
  nutrition: { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, fruit_veg_nuts_pct: 0 },
  score: { overall: 50, grade: "C", verdict: "", positives: [], negatives: [], breakdown: { nutrients: [], india_flags: [] } }, ...over });

describe("ExploreScreen", () => {
  it("renders category tiles with counts", async () => {
    vi.spyOn(catalog, "fetchCategories").mockResolvedValue({ categories: [{ category: "drinks", count: 90 }, { category: "namkeen", count: 74 }] });
    const onOpenCategory = vi.fn();
    render(<ExploreScreen token="t" onOpenCategory={onOpenCategory} onOpenProduct={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("drinks")).toBeInTheDocument());
    expect(screen.getByText(/90/)).toBeInTheDocument();
    await userEvent.click(screen.getByText("drinks"));
    expect(onOpenCategory).toHaveBeenCalledWith("drinks");
  });

  it("typing shows search results from the products API", async () => {
    vi.spyOn(catalog, "fetchCategories").mockResolvedValue({ categories: [] });
    vi.spyOn(catalog, "fetchCatalogProducts").mockResolvedValue({ items: [prod({ name: "Amul Buttermilk" }) as never], total: 1 });
    const onOpenProduct = vi.fn();
    render(<ExploreScreen token="t" onOpenCategory={vi.fn()} onOpenProduct={onOpenProduct} />);
    await userEvent.type(screen.getByPlaceholderText(/search/i), "amul");
    await waitFor(() => expect(screen.getByText("Amul Buttermilk")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Amul Buttermilk"));
    expect(onOpenProduct).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run → fail. Step 3: Create `ExploreScreen.tsx`:**

```tsx
import { useEffect, useState } from "react";
import type { CategoryCount, Product } from "../api/types";
import { fetchCategories, fetchCatalogProducts } from "../api/catalog";
import { gradeTone } from "../scan/grade";
import styles from "./ExploreScreen.module.css";

interface Props {
  token: string;
  onOpenCategory: (category: string) => void;
  onOpenProduct: (p: Product) => void;
}

const EMOJI: Record<string, string> = {
  drinks: "🥤", namkeen: "🥜", "breakfast cereal": "🥣", chocolate: "🍫",
  biscuits: "🍪", "spreads & sauces": "🫙", "condiments & spices": "🧂",
};

export function ExploreScreen({ token, onOpenCategory, onOpenProduct }: Props) {
  const [cats, setCats] = useState<CategoryCount[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Product[] | null>(null);

  useEffect(() => {
    let off = false;
    fetchCategories(token).then((r) => !off && setCats(r.categories)).catch(() => !off && setErr(true));
    return () => { off = true; };
  }, [token]);

  useEffect(() => {
    const query = q.trim();
    if (!query) { setResults(null); return; }
    let off = false;
    const id = setTimeout(() => {
      fetchCatalogProducts(token, { q: query, limit: 50 })
        .then((r) => !off && setResults(r.items)).catch(() => !off && setResults([]));
    }, 250);
    return () => { off = true; clearTimeout(id); };
  }, [q, token]);

  return (
    <div className={styles.screen}>
      <h1 className={styles.h1}>Explore</h1>
      <input className={styles.search} placeholder="Search products or brands"
             value={q} onChange={(e) => setQ(e.target.value)} />

      {q.trim() ? (
        <div className={styles.results}>
          {results === null && <div className={styles.muted}>Searching…</div>}
          {results && results.length === 0 && <div className={styles.muted}>No products found.</div>}
          {results && results.map((p) => (
            <button key={p.barcode} className={styles.ritem} onClick={() => onOpenProduct(p)}>
              {p.image_url
                ? <img className={styles.rthumb} src={p.image_url} alt={p.name || "product"} />
                : <span className={styles.rph} aria-hidden="true">🛒</span>}
              <span className={`${styles.grade} ${styles[gradeTone(p.score.grade)]}`}>{p.score.grade}</span>
              <span className={styles.rinfo}>
                <span className={styles.rname}>{p.name || "Unknown product"}</span>
                <span className={styles.rmeta}>{p.score.overall}/100 · {p.category} · {p.brand}</span>
              </span>
            </button>
          ))}
        </div>
      ) : err ? (
        <div className={styles.muted}>Couldn't load categories.</div>
      ) : (
        <div className={styles.tiles}>
          {(cats ?? []).map((c) => (
            <button key={c.category} className={`${styles.tile} ${styles[`t_${c.category.split(" ")[0]}`] ?? ""}`}
                    onClick={() => onOpenCategory(c.category)}>
              <span className={styles.em}>{EMOJI[c.category] ?? "🍽️"}</span>
              <span className={styles.tname}>{c.category}</span>
              <span className={styles.tcount}>{c.count} products</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `ExploreScreen.module.css`:**

```css
.screen { min-height: 100dvh; background: var(--paper); color: var(--ink); padding: 14px 16px 80px; }
.h1 { font-size: 24px; font-weight: 800; margin: 6px 2px 10px; }
.search { width: 100%; border: 1px solid var(--line); background: var(--card); border-radius: 13px;
  padding: 12px 14px; font-size: 14px; font-family: inherit; margin-bottom: 14px; }
.muted { color: var(--muted); font-size: 13.5px; padding: 16px 2px; }
.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
.tile { border-radius: 18px; padding: 16px 14px; min-height: 100px; display: flex; flex-direction: column;
  justify-content: space-between; color: #fff; text-align: left; background: linear-gradient(150deg, #1fa463, #0b3d2c); }
.em { font-size: 26px; }
.tname { font-size: 15px; font-weight: 800; text-transform: capitalize; }
.tcount { font-size: 11px; opacity: .85; font-weight: 600; }
.t_drinks { background: linear-gradient(150deg, #2a8cf0, #0b4a8c); }
.t_namkeen { background: linear-gradient(150deg, #f0a23b, #b25e12); }
.t_breakfast { background: linear-gradient(150deg, #e0a93b, #9c6b12); }
.t_chocolate { background: linear-gradient(150deg, #7b4a2b, #3d2317); }
.t_biscuits { background: linear-gradient(150deg, #d98a4a, #8c4a1c); }
.t_spreads { background: linear-gradient(150deg, #1fa463, #0b3d2c); }
.t_condiments { background: linear-gradient(150deg, #b05cd6, #5e2b86); }
.results { display: flex; flex-direction: column; gap: 8px; }
.ritem { display: flex; align-items: center; gap: 11px; background: var(--card); border: 1px solid var(--line);
  border-radius: 13px; padding: 9px; text-align: left; }
.rthumb, .rph { width: 42px; height: 42px; border-radius: 9px; object-fit: contain; background: #fff;
  border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
.grade { width: 28px; height: 28px; border-radius: 8px; color: #fff; font-weight: 800; font-size: 13px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.grade.good { background: var(--green); } .grade.ok { background: var(--amber); } .grade.bad { background: var(--red); }
.rinfo { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.rname { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rmeta { font-size: 10.5px; color: var(--muted); }
```

- [ ] **Step 5: Run → pass. Step 6: Commit** `feat: ExploreScreen (category tiles + search)`.

---

## Task 5: CategoryScreen (grid + grade filter)

**Files:** Create `src/screens/CategoryScreen.tsx` + `.module.css` + test.

- [ ] **Step 1: `CategoryScreen.test.tsx`:**

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryScreen } from "./CategoryScreen";
import * as catalog from "../api/catalog";

afterEach(() => vi.restoreAllMocks());

const prod = (name: string, grade = "A") => ({ barcode: name, name, brand: "Br", source: "amazon", ingredients: [], category: "drinks",
  nutrition: { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, fruit_veg_nuts_pct: 0 },
  score: { overall: 80, grade, verdict: "", positives: [], negatives: [], breakdown: { nutrients: [], india_flags: [] } } });

describe("CategoryScreen", () => {
  it("loads and renders a product grid for the category", async () => {
    const spy = vi.spyOn(catalog, "fetchCatalogProducts").mockResolvedValue({ items: [prod("Coconut Water") as never], total: 1 });
    render(<CategoryScreen token="t" category="drinks" onOpenProduct={vi.fn()} onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Coconut Water")).toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith("t", expect.objectContaining({ category: "drinks", limit: 200 }));
  });

  it("selecting a grade chip refetches with that grade", async () => {
    const spy = vi.spyOn(catalog, "fetchCatalogProducts").mockResolvedValue({ items: [], total: 0 });
    render(<CategoryScreen token="t" category="drinks" onOpenProduct={vi.fn()} onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "A" }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith("t", expect.objectContaining({ category: "drinks", grade: "A" })));
  });

  it("calls onBack", async () => {
    vi.spyOn(catalog, "fetchCatalogProducts").mockResolvedValue({ items: [], total: 0 });
    const onBack = vi.fn();
    render(<CategoryScreen token="t" category="drinks" onOpenProduct={vi.fn()} onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run → fail. Step 3: Create `CategoryScreen.tsx`:**

```tsx
import { useEffect, useState } from "react";
import type { Product } from "../api/types";
import { fetchCatalogProducts } from "../api/catalog";
import { gradeTone } from "../scan/grade";
import styles from "./CategoryScreen.module.css";

interface Props {
  token: string;
  category: string;
  onOpenProduct: (p: Product) => void;
  onBack: () => void;
}

const GRADES = ["A", "B", "C", "D", "E"];

export function CategoryScreen({ token, category, onOpenProduct, onBack }: Props) {
  const [grade, setGrade] = useState("");
  const [items, setItems] = useState<Product[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let off = false;
    setItems(null);
    fetchCatalogProducts(token, { category, grade, limit: 200 })
      .then((r) => { if (!off) { setItems(r.items); setTotal(r.total); } })
      .catch(() => { if (!off) setItems([]); });
    return () => { off = true; };
  }, [token, category, grade]);

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <button className={styles.back} onClick={onBack} aria-label="Back">‹</button>
        <span className={styles.title}>{category}</span>
        <span className={styles.count}>{total} products</span>
      </div>
      <div className={styles.filter}>
        <span className={styles.flab}>Grade</span>
        <button className={`${styles.chip} ${grade === "" ? styles.on : ""}`} onClick={() => setGrade("")}>All</button>
        {GRADES.map((g) => (
          <button key={g} className={`${styles.chip} ${grade === g ? styles.on : ""}`} onClick={() => setGrade(g)}>{g}</button>
        ))}
      </div>
      {items === null ? (
        <div className={styles.muted}>Loading…</div>
      ) : items.length === 0 ? (
        <div className={styles.muted}>No products here yet.</div>
      ) : (
        <div className={styles.grid}>
          {items.map((p) => (
            <button key={p.barcode} className={styles.card} onClick={() => onOpenProduct(p)}>
              <span className={`${styles.badge} ${styles[gradeTone(p.score.grade)]}`}>{p.score.grade}</span>
              {p.image_url
                ? <img className={styles.img} src={p.image_url} alt={p.name || "product"} />
                : <span className={styles.ph} aria-hidden="true">🛒</span>}
              <span className={styles.nm}>{p.name || "Unknown product"}</span>
              <span className={styles.mt}>{p.score.overall}/100 · {p.brand}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `CategoryScreen.module.css`:**

```css
.screen { min-height: 100dvh; background: var(--paper); color: var(--ink); padding: 14px 16px 24px; }
.top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.back { font-size: 24px; line-height: 1; color: var(--ink); background: transparent; padding: 0 4px; }
.title { font-size: 19px; font-weight: 800; text-transform: capitalize; }
.count { font-size: 12px; color: var(--muted); font-weight: 600; margin-left: auto; }
.filter { display: flex; align-items: center; gap: 7px; overflow-x: auto; padding: 4px 0 12px; }
.flab { font-size: 11px; font-weight: 700; color: var(--muted); flex: 0 0 auto; }
.chip { flex: 0 0 auto; font-size: 12px; font-weight: 800; padding: 6px 12px; border-radius: 999px;
  background: var(--card); border: 1px solid var(--line); color: var(--ink); }
.chip.on { background: var(--green-deep); color: #fff; border-color: var(--green-deep); }
.muted { color: var(--muted); font-size: 13.5px; padding: 24px 2px; text-align: center; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.card { position: relative; background: var(--card); border: 1px solid var(--line); border-radius: 15px;
  padding: 9px; text-align: left; }
.badge { position: absolute; top: 14px; left: 14px; width: 22px; height: 22px; border-radius: 7px;
  color: #fff; font-weight: 800; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.badge.good { background: var(--green); } .badge.ok { background: var(--amber); } .badge.bad { background: var(--red); }
.img, .ph { width: 100%; height: 84px; border-radius: 10px; object-fit: contain; background: #fff;
  border: 1px solid var(--line); margin-bottom: 7px; display: flex; align-items: center; justify-content: center; font-size: 30px; }
.nm { font-size: 11.5px; font-weight: 700; line-height: 1.18; display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden; }
.mt { font-size: 10.5px; color: var(--muted); margin-top: 3px; display: block; }
```

- [ ] **Step 5: Run → pass. Step 6: Commit** `feat: CategoryScreen (grid + grade filter)`.

---

## Task 6: Rewrite App for stack navigation + tab bar

**Files:** Rewrite `src/App.tsx`.

- [ ] **Step 1: Replace `src/App.tsx` with:**

```tsx
import { useState, useEffect } from "react";
import { SessionProvider, useSession } from "./session/SessionContext";
import { AuthScreen } from "./screens/AuthScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { ScanScreen } from "./screens/ScanScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { CompareScreen } from "./screens/CompareScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { ExploreScreen } from "./screens/ExploreScreen";
import { CategoryScreen } from "./screens/CategoryScreen";
import { TabBar } from "./components/TabBar";
import { ProfileMenu } from "./components/ProfileMenu";
import { push, pop, selectTab, pushResultFromScan, top, activeTab, isTabRoot, type Stack, type Tab } from "./session/nav";
import { addToHistory, loadHistory, clearHistory, type HistoryEntry } from "./session/history";
import type { Product, ScanResult } from "./api/types";

function Shell() {
  const { token, isGuest, email, guest, loginGoogle, signOut } = useSession();
  const [stack, setStack] = useState<Stack>([{ t: "home" }]);
  const [remaining, setRemaining] = useState<number | undefined>(undefined);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

  // Mirror the screen stack into browser history so the device Back button restores it.
  useEffect(() => {
    window.history.replaceState({ stack: [{ t: "home" }] }, "");
    const onPop = (e: PopStateEvent) => {
      const s = e.state?.stack as Stack | undefined;
      setStack(s && s.length ? s : [{ t: "home" }]);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = (next: Stack, mode: "push" | "replace" = "push") => {
    setStack(next);
    if (mode === "replace") window.history.replaceState({ stack: next }, "");
    else window.history.pushState({ stack: next }, "");
  };
  const back = () => window.history.back();

  const handleResult = (r: ScanResult) => {
    setRemaining(r.remaining);
    setHistory(addToHistory(r.product, Date.now()));
    go(pushResultFromScan(stack, r), "replace");
  };
  const showProduct = (product: Product) => {
    go(push(stack, { t: "result", result: { source: product.source, remaining: remaining ?? 0, product } }));
  };

  if (!token) return <AuthScreen onGuest={guest} onGoogleLogin={loginGoogle} />;

  const cur = top(stack);
  const profile = (variant: "light" | "dark") => (
    <div style={{ position: "absolute", top: 16, right: 16, zIndex: 60 }}>
      <ProfileMenu label={email ?? "Guest"} isGuest={isGuest} variant={variant}
        onHistory={() => go(selectTab(stack, "history"))} onSignOut={signOut} />
    </div>
  );
  const tabbed = (node: React.ReactNode, variant: "light" | "dark") => (
    <div style={{ position: "relative", minHeight: "100dvh", paddingBottom: 64 }}>
      {profile(variant)}
      {node}
      <TabBar active={activeTab(stack) as Tab} onSelect={(t) => go(selectTab(stack, t))} />
    </div>
  );

  if (cur.t === "compare") {
    return <CompareScreen a={cur.a} b={cur.b} onBack={back} />;
  }
  if (cur.t === "result") {
    return (
      <div style={{ position: "relative", minHeight: "100dvh" }}>
        {profile("dark")}
        <ResultScreen
          product={cur.result.product}
          alternatives={cur.result.alternatives ?? []}
          onCompare={(alt) => go(push(stack, { t: "compare", a: cur.result.product, b: alt }))}
          onScanAgain={back}
        />
      </div>
    );
  }
  if (cur.t === "scan") {
    return (
      <ScanScreen token={token} remaining={remaining} isGuest={isGuest}
        onResult={handleResult} onBack={back} onSignIn={signOut} onAuthError={signOut} />
    );
  }
  if (cur.t === "category") {
    return <CategoryScreen token={token} category={cur.category} onOpenProduct={showProduct} onBack={back} />;
  }
  if (cur.t === "explore") {
    return tabbed(
      <ExploreScreen token={token}
        onOpenCategory={(c) => go(push(stack, { t: "category", category: c }))}
        onOpenProduct={showProduct} />, "light");
  }
  if (cur.t === "history") {
    return tabbed(
      <HistoryScreen entries={history} onBack={back} onOpen={showProduct}
        onClear={() => { clearHistory(); setHistory([]); }} />, "light");
  }
  // home
  return tabbed(
    <HomeScreen token={token} remaining={remaining} isGuest={isGuest} history={history}
      onResult={handleResult} onOpenCamera={() => go(push(stack, { t: "scan" }))}
      onOpenProduct={showProduct} onSeeHistory={() => go(selectTab(stack, "history"))}
      onSignIn={signOut} onAuthError={signOut} />, "light");
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
```

- [ ] **Step 2: Run the full suite + build.**

Run (from `frontend/`): `npm test` then `npm run build`
Expected: all pass; clean `tsc + vite build`. (Fix any import of `React` type — if `React.ReactNode` errors, change the `tabbed` param type to `import { type ReactNode } from "react"` and use `ReactNode`.)

- [ ] **Step 3: Commit** `feat: stack-driven App nav with bottom tab bar + Explore/Category`.

---

## Task 7: Full verification + deploy

- [ ] **Step 1:** `npm test` → 0 failed. **Step 2:** `npm run build` → clean.
- [ ] **Step 3 (only if fixes):** `git add -A && git commit -m "test: fixes from Explore verification"`.
- [ ] **Step 4: Push** `git push origin main` (Vercel auto-deploys).
- [ ] **Step 5:** Confirm the latest production deployment reaches `READY`, then on `https://parakh.skdev.one` (hard-refresh twice for the PWA): a bottom tab bar shows; Explore lists category tiles with counts; a tile opens the grid; grade chips filter; tapping a product opens its score page; Back walks Compare→Result→Category→Explore and Home exits; search returns results.
