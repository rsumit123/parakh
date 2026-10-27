import { describe, it, expect } from "vitest";
import { computeTargets, DEFAULT_TARGETS, type AboutYou } from "./targets";

// Same cases and numbers as backend tests/test_targets.py.
const P: AboutYou = { sex: "male", age: 30, weight_kg: 70, height_cm: 175, activity: "moderate", goal: "maintain" };
const kcal = (kj: number) => Math.round(kj / 4.184);

describe("computeTargets", () => {
  it("matches the server for a complete profile", () => {
    const t = computeTargets(P);
    expect(kcal(t.energy_kj)).toBe(2556);
    expect([t.protein_g, t.fibre_g, t.sugars_g, t.sat_fat_g, t.salt_g]).toEqual([58, 38, 64, 28, 5]);
    expect([t.carbs_g, t.fat_g]).toEqual([320, 85]);   // 50% / 30% of energy, as on the server
  });
  it("adjusts for sex and goal, with a calorie floor", () => {
    const lose = computeTargets({ ...P, sex: "female", goal: "lose" });
    expect(kcal(lose.energy_kj)).toBe(1798);
    expect(lose.protein_g).toBe(77);
    expect(kcal(computeTargets({ ...P, goal: "gain" }).energy_kj)).toBe(2856);
    expect(kcal(computeTargets({ sex: "female", age: 70, weight_kg: 40, height_cm: 145,
      activity: "sedentary", goal: "lose" }).energy_kj)).toBe(1200);
  });
  it("falls back to defaults when incomplete", () => {
    expect(computeTargets({ ...P, height_cm: null })).toEqual(DEFAULT_TARGETS);
  });
});
