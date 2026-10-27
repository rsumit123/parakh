import type { Macros, MacroKey, Profile } from "../api/diet";

// Live preview of the server's target maths, so the Targets screen updates as you
// type. Keep in sync with backend app/nutrition/targets.py (the server is the source
// of truth for what the day view uses); targets.test.ts pins the same numbers.

export const DEFAULT_TARGETS: Macros = {
  energy_kj: 8368, protein_g: 50, fibre_g: 30, sugars_g: 50, sat_fat_g: 22, salt_g: 5,
};
const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 } as const;
const GOAL_KCAL = { lose: -500, maintain: 0, gain: 300 } as const;
const PROTEIN_PER_KG = { lose: 1.1, maintain: 0.83, gain: 1.1 } as const;
const MIN_KCAL = 1200;

export type AboutYou = Omit<Profile, "target_overrides">;

export function isComplete(p: AboutYou): boolean {
  return !!(p.sex && p.age && p.weight_kg && p.height_cm && p.activity && p.goal);
}

/** Targets from the profile alone (no overrides), or the defaults if incomplete. */
export function computeTargets(p: AboutYou): Macros {
  if (!isComplete(p)) return DEFAULT_TARGETS;
  const w = p.weight_kg!, h = p.height_cm!, age = p.age!;
  const bmr = 10 * w + 6.25 * h - 5 * age + (p.sex === "male" ? 5 : -161);
  const kcalDay = Math.round(Math.max(MIN_KCAL, bmr * ACTIVITY[p.activity!] + GOAL_KCAL[p.goal!]));
  return {
    energy_kj: kcalDay * 4.184,
    protein_g: Math.round(w * PROTEIN_PER_KG[p.goal!]),
    fibre_g: Math.round((kcalDay * 15) / 1000),
    sugars_g: Math.round((kcalDay * 0.1) / 4),
    sat_fat_g: Math.round((kcalDay * 0.1) / 9),
    salt_g: 5,
  };
}

/** Same value for display purposes (energy compared in whole kcal). */
export function sameTarget(k: MacroKey, a: number, b: number): boolean {
  return k === "energy_kj" ? Math.round(a / 4.184) === Math.round(b / 4.184) : Math.round(a) === Math.round(b);
}
