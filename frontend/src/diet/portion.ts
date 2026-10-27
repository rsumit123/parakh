import { MACRO_KEYS, OPT_KEYS, type Macros, type OptKey } from "../api/diet";
import type { Nutrition } from "../api/types";

const isOpt = (k: string): k is OptKey => (OPT_KEYS as string[]).includes(k);

/** Nutrients for `grams` of a food. Unknown carbs/fat (null) stay unknown. */
export function portionMacros(per100g: Macros, grams: number): Macros {
  const out = {} as Record<string, number | null>;
  for (const k of MACRO_KEYS) {
    const v = per100g[k];
    out[k] = v == null ? (isOpt(k) ? null : 0) : (v * grams) / 100;
  }
  return out as Macros;
}

/** Sum several foods' nutrients; a carb/fat total is unknown if any part is unknown
 * (a partial sum would quietly undercount). */
export function sumMacros(parts: Macros[]): Macros {
  const out = {} as Record<string, number | null>;
  for (const k of MACRO_KEYS) {
    out[k] = parts.some((p) => p[k] == null) && isOpt(k) ? null
      : parts.reduce((s, p) => s + (p[k] ?? 0), 0);
  }
  return out as Macros;
}

/** Product label nutrition as Macros (carbs/fat may be missing on older products). */
export function nutritionMacros(n: Nutrition): Macros {
  return { energy_kj: n.energy_kj, sugars_g: n.sugars_g, sat_fat_g: n.sat_fat_g, salt_g: n.salt_g,
           fibre_g: n.fibre_g, protein_g: n.protein_g, carbs_g: n.carbs_g ?? null, fat_g: n.fat_g ?? null };
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

// Beverage detection from a dish name, so portion UI reads "glass/ml" not "plate/g".
const LIQUID_RE = /\b(juice|lassi|shake|milkshake|smoothie|coffee|latte|cappuccino|espresso|frappe|tea|chai|soda|cola|drink|water|buttermilk|chaas|milk|lemonade|sharbat|nimbu|kombucha|mocktail|cocktail|sherbet)\b/i;
export function isLiquid(name: string): boolean {
  return LIQUID_RE.test(name || "");
}
