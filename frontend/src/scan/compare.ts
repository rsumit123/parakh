import type { Product } from "../api/types";

export interface CompareRow {
  key: string;
  label: string;
  unit: string;
  aValue: number;
  bValue: number;
  winner: "a" | "b" | "none";
}

export function kcalFromKj(kj: number): number {
  return Math.round((kj || 0) / 4.184);
}

interface NutrientCfg {
  key: string;
  label: string;
  unit: string;
  higherIsBetter: boolean;
  get: (p: Product) => number;
}

const NUTRIENTS: NutrientCfg[] = [
  { key: "energy", label: "Energy", unit: "kcal", higherIsBetter: false, get: (p) => kcalFromKj(p.nutrition.energy_kj) },
  { key: "sugars_g", label: "Sugar", unit: "g", higherIsBetter: false, get: (p) => p.nutrition.sugars_g },
  { key: "sat_fat_g", label: "Saturated fat", unit: "g", higherIsBetter: false, get: (p) => p.nutrition.sat_fat_g },
  { key: "salt_g", label: "Salt", unit: "g", higherIsBetter: false, get: (p) => p.nutrition.salt_g },
  { key: "fibre_g", label: "Fibre", unit: "g", higherIsBetter: true, get: (p) => p.nutrition.fibre_g },
  { key: "protein_g", label: "Protein", unit: "g", higherIsBetter: true, get: (p) => p.nutrition.protein_g },
];

export function buildComparison(a: Product, b: Product): CompareRow[] {
  return NUTRIENTS.map((n) => {
    const aValue = n.get(a);
    const bValue = n.get(b);
    let winner: "a" | "b" | "none" = "none";
    if (aValue !== bValue) {
      const aBetter = n.higherIsBetter ? aValue > bValue : aValue < bValue;
      winner = aBetter ? "a" : "b";
    }
    return { key: n.key, label: n.label, unit: n.unit, aValue, bValue, winner };
  });
}
