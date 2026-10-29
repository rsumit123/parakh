import type { Totals, MacroKey, Profile } from "../api/diet";

// Live preview of the server's target maths, so the Targets screen updates as you
// type. Keep in sync with backend app/nutrition/targets.py (the server is the source
// of truth for what the day view uses); targets.test.ts pins the same numbers.

export const DEFAULT_TARGETS: Totals = {
  energy_kj: 8368, protein_g: 50, fibre_g: 30, sugars_g: 50, sat_fat_g: 22, salt_g: 5,
  carbs_g: 250, fat_g: 67,
};
const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 } as const;
const GOAL_KCAL = { lose: -500, maintain: 0, gain: 300 } as const;
const PROTEIN_PER_KG = { lose: 1.1, maintain: 0.83, gain: 1.1 } as const;
const MIN_KCAL = 1200;

export type AboutYou = Omit<Profile, "target_overrides">;

export function isComplete(p: AboutYou): boolean {
  return !!(p.sex && p.age && p.weight_kg && p.height_cm && p.activity && p.goal);
}

export type Basis = "calculated" | "estimated" | "default";
/** calculated = full profile; estimated = some fields, rest assumed; default = none. */
export function basisOf(p: AboutYou): Basis {
  if (isComplete(p)) return "calculated";
  return p.sex || p.age || p.weight_kg || p.height_cm || p.activity || p.goal ? "estimated" : "default";
}

// Assumed values for fields not filled in yet (typical Indian adults), so every
// choice moves the targets. Same as the server's _ASSUME / _ASSUME_BODY.
export const ASSUMED = {
  age: 30,
  body: { male: [172, 70], female: [158, 57], none: [165, 63] } as Record<string, [number, number]>,
};

/** Targets from the profile alone (no overrides): calculated, estimated with
 * assumptions for missing fields, or the generic defaults if nothing is set. */
export function computeTargets(p: AboutYou): Totals {
  const basis = basisOf(p);
  if (basis === "default") return DEFAULT_TARGETS;
  const [hAssumed, wAssumed] = ASSUMED.body[p.sex ?? "none"];
  const w = p.weight_kg || wAssumed, h = p.height_cm || hAssumed, age = p.age || ASSUMED.age;
  const activity = p.activity ?? "light", goal = p.goal ?? "maintain";
  const sexTerm = p.sex === "male" ? 5 : p.sex === "female" ? -161 : -78;
  const bmr = 10 * w + 6.25 * h - 5 * age + sexTerm;
  const kcalDay = Math.round(Math.max(MIN_KCAL, bmr * ACTIVITY[activity] + GOAL_KCAL[goal]));
  return {
    energy_kj: kcalDay * 4.184,
    protein_g: Math.round(w * PROTEIN_PER_KG[goal]),
    fibre_g: Math.round((kcalDay * 15) / 1000),
    sugars_g: Math.round((kcalDay * 0.1) / 4),
    sat_fat_g: Math.round((kcalDay * 0.1) / 9),
    salt_g: 5,
    carbs_g: Math.round((kcalDay * 0.5) / 4),   // ~50% of energy, for reference
    fat_g: Math.round((kcalDay * 0.3) / 9),     // ~30% of energy, for reference
  };
}

/** Same value for display purposes (energy compared in whole kcal). */
export function sameTarget(k: MacroKey, a: number, b: number): boolean {
  return k === "energy_kj" ? Math.round(a / 4.184) === Math.round(b / 4.184) : Math.round(a) === Math.round(b);
}
