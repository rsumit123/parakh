import { describe, it, expect } from "vitest";
import { computeTargets, DEFAULT_TARGETS, type AboutYou } from "./targets";

// Same cases and numbers as backend tests/test_targets.py.
const P: AboutYou = { sex: "male", age: 30, weight_kg: 70, height_cm: 175, activity: "moderate", goal: "maintain" };
const kcal = (kj: number) => Math.round(kj / 4.184);

describe("computeTargets", () => {
  it("matches the server for a complete profile", () => {
    const t = computeTargets(P);
    expect(kcal(t.energy_kj)).toBe(2715);   // ICMR-NIN BMR x 1.8
    expect([t.protein_g, t.fibre_g, t.sugars_g, t.sat_fat_g, t.salt_g]).toEqual([58, 54, 68, 30, 5]);
    expect([t.carbs_g, t.fat_g]).toEqual([339, 91]);   // 50% / 30% of energy, as on the server
  });
  it("adjusts for sex and goal, with a calorie floor", () => {
    const lose = computeTargets({ ...P, sex: "female", goal: "lose" });
    expect(kcal(lose.energy_kj)).toBe(1817);
    expect(lose.protein_g).toBe(77);
    expect(kcal(computeTargets({ ...P, goal: "gain" }).energy_kj)).toBe(3015);
    expect(kcal(computeTargets({ sex: "female", age: 70, weight_kg: 40, height_cm: 145,
      activity: "sedentary", goal: "lose" }).energy_kj)).toBe(1200);
  });
  it("estimates from a partial profile, matching the server", () => {
    // owner's real case: everything except age (server test: 2364 kcal)
    const t = computeTargets({ sex: "male", age: null, height_cm: 180, weight_kg: 67, activity: "light", goal: "maintain" });
    expect(kcal(t.energy_kj)).toBe(2364);
    expect(t.protein_g).toBe(56);
    // ICMR energy doesn't use height, so a missing one changes nothing (server: 2715 kcal)
    expect(kcal(computeTargets({ ...P, height_cm: null }).energy_kj)).toBe(2715);
  });
  it("reproduces ICMR-NIN's reference adults", () => {
    const man = { sex: "male" as const, age: 25, weight_kg: 65, height_cm: 170, goal: "maintain" as const };
    const got = (["sedentary", "moderate", "active"] as const).map((a) => kcal(computeTargets({ ...man, activity: a }).energy_kj));
    [2110, 2710, 3470].forEach((want, i) => expect(Math.abs(got[i] - want)).toBeLessThanOrEqual(12));
  });
  it("moves with a single choice", () => {
    const empty = { sex: null, age: null, weight_kg: null, height_cm: null, activity: null, goal: null };
    expect(computeTargets(empty)).toEqual(DEFAULT_TARGETS);
    const active = kcal(computeTargets({ ...empty, activity: "active" }).energy_kj);
    const lose = kcal(computeTargets({ ...empty, goal: "lose" }).energy_kj);
    expect(active).toBeGreaterThan(2000);
    expect(lose).toBeLessThan(2000);
  });
});

