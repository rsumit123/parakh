import { describe, it, expect } from "vitest";
import { portionMacros, defaultServingG, kcal } from "./portion";

const per100 = { energy_kj: 360, sugars_g: 14.5, sat_fat_g: 1.25, salt_g: 0.075, fibre_g: 0, protein_g: 2.1 };

describe("portionMacros", () => {
  it("scales per-100g by grams", () => {
    const m = portionMacros(per100, 200);
    expect(m.sugars_g).toBeCloseTo(29);
    expect(m.protein_g).toBeCloseTo(4.2);
  });
  it("zero grams -> zero", () => {
    expect(portionMacros(per100, 0).sugars_g).toBe(0);
  });
});

describe("defaultServingG", () => {
  it("uses product serving size when present", () => {
    expect(defaultServingG(30, "chips")).toBe(30);
  });
  it("falls back to a category default", () => {
    expect(defaultServingG(null, "drinks")).toBe(200);
    expect(defaultServingG(undefined, "unknown")).toBe(40);
  });
});

describe("kcal", () => {
  it("converts kJ to rounded kcal", () => {
    expect(kcal(418.4)).toBe(100);
  });
});
