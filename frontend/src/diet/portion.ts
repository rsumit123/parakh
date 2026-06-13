import type { Macros, MacroKey } from "../api/diet";

const KEYS: MacroKey[] = ["energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g"];

export function portionMacros(per100g: Macros, grams: number): Macros {
  const out = {} as Macros;
  for (const k of KEYS) out[k] = (per100g[k] || 0) * grams / 100;
  return out;
}

// Per-category serving fallback (grams) when a product has no serving_size_g.
const CATEGORY_SERVING: Record<string, number> = {
  drinks: 200, "health drinks": 200, dairy: 150, "ice cream": 60,
  chips: 30, namkeen: 30, biscuits: 25, chocolate: 20, bread: 40,
  "breakfast cereal": 40, "noodles & pasta": 70, "spreads & sauces": 15,
  "dry fruits & nuts": 30, "protein bars": 40,
};
export function defaultServingG(servingSizeG: number | null | undefined, category: string): number {
  if (typeof servingSizeG === "number" && servingSizeG > 0) return servingSizeG;
  return CATEGORY_SERVING[category] ?? 40;
}

export function kcal(energyKj: number): number {
  return Math.round(energyKj / 4.184);
}
