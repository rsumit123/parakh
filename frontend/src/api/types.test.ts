import { describe, it, expect } from "vitest";
import type { ScanResult, Grade } from "./types";
import { isGrade } from "./types";

describe("api types", () => {
  it("isGrade recognizes valid grades", () => {
    expect(isGrade("A")).toBe(true);
    expect(isGrade("E")).toBe(true);
    expect(isGrade("Z")).toBe(false);
    expect(isGrade("")).toBe(false);
  });

  it("a well-formed ScanResult is assignable", () => {
    const r: ScanResult = {
      source: "off",
      remaining: 2,
      product: {
        barcode: "111", name: "Chana", brand: "Tata", ingredients: ["chana"],
        nutrition: { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, fruit_veg_nuts_pct: 0 },
        source: "off",
        score: {
          overall: 84, grade: "A" as Grade, verdict: "Good choice",
          positives: ["Fibre (5g)"], negatives: [],
          breakdown: { nutrients: [{ key: "sugars", label: "Sugar", value_g: 2, pct: 18, level: "low", high_is_bad: true }], india_flags: [] },
        },
      },
    };
    expect(r.product.score.grade).toBe("A");
  });
});
