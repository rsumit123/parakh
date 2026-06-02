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
