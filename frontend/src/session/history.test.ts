import { describe, it, expect, beforeEach } from "vitest";
import { loadHistory, addToHistory, clearHistory } from "./history";
import type { Product } from "../api/types";

function product(barcode: string, name: string, grade = "A"): Product {
  return {
    barcode, name, brand: "B", ingredients: [], source: "off",
    nutrition: { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, fruit_veg_nuts_pct: 0 },
    score: { overall: 80, grade: grade as Product["score"]["grade"], verdict: "Good choice", positives: [], negatives: [], breakdown: { nutrients: [], india_flags: [] } },
  };
}

beforeEach(() => localStorage.clear());

describe("history", () => {
  it("starts empty", () => {
    expect(loadHistory()).toEqual([]);
  });

  it("prepends new scans (most recent first)", () => {
    addToHistory(product("1", "A"), 1000);
    addToHistory(product("2", "B"), 2000);
    const h = loadHistory();
    expect(h.map((e) => e.product.barcode)).toEqual(["2", "1"]);
  });

  it("de-duplicates by barcode, keeping the most recent", () => {
    addToHistory(product("1", "Old", "E"), 1000);
    addToHistory(product("1", "New", "A"), 2000);
    const h = loadHistory();
    expect(h).toHaveLength(1);
    expect(h[0].product.name).toBe("New");
    expect(h[0].at).toBe(2000);
  });

  it("clears history", () => {
    addToHistory(product("1", "A"), 1000);
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });

  it("survives corrupt storage gracefully", () => {
    localStorage.setItem("parakh.history", "not json");
    expect(loadHistory()).toEqual([]);
  });
});
