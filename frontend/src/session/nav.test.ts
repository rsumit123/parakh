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

describe("today tab", () => {
  it("today is a tab root", () => {
    expect(isTabRoot({ t: "today" })).toBe(true);
    expect(activeTab(selectTab([{ t: "home" }], "today"))).toBe("today");
  });
});
