import { describe, it, expect } from "vitest";
import { portionMacros, sumMacros, defaultServingG, kcal, isLiquid } from "./portion";

const per100 = { energy_kj: 360, sugars_g: 14.5, sat_fat_g: 1.25, salt_g: 0.075, fibre_g: 0, protein_g: 2.1, carbs_g: 16, fat_g: null };

describe("portionMacros", () => {
  it("scales per-100g by grams", () => {
    const m = portionMacros(per100, 200);
    expect(m.sugars_g).toBeCloseTo(29);
    expect(m.protein_g).toBeCloseTo(4.2);
  });
  it("zero grams -> zero", () => {
    expect(portionMacros(per100, 0).sugars_g).toBe(0);
  });
  it("scales carbs and keeps unknown fat unknown (not 0)", () => {
    const m = portionMacros(per100, 200);
    expect(m.carbs_g).toBeCloseTo(32);
    expect(m.fat_g).toBeNull();
  });
});

describe("sumMacros", () => {
  it("adds parts; a carb/fat total is unknown if any part is unknown", () => {
    const a = { ...per100, carbs_g: 10, fat_g: 2 };
    const s = sumMacros([a, { ...per100, carbs_g: 5, fat_g: null }]);
    expect(s.protein_g).toBeCloseTo(4.2);
    expect(s.carbs_g).toBe(15);
    expect(s.fat_g).toBeNull();
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

describe("isLiquid", () => {
  it("flags drinks", () => {
    for (const n of ["Mango Lassi", "Orange Juice", "Cold Coffee", "Banana shake", "Coca-Cola", "Masala Chai", "Rose Milk"])
      expect(isLiquid(n)).toBe(true);
  });
  it("does not flag solids or false-substring traps", () => {
    for (const n of ["Dal rice", "Grilled steak", "Watermelon", "Paneer tikka", ""])
      expect(isLiquid(n)).toBe(false);
  });
});
