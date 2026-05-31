export type Grade = "A" | "B" | "C" | "D" | "E";
export type Source = "db" | "off" | "photo";
export type BarLevel = "low" | "ok" | "high";

export function isGrade(value: string): value is Grade {
  return ["A", "B", "C", "D", "E"].includes(value);
}

export interface Nutrition {
  energy_kj: number;
  sugars_g: number;
  sat_fat_g: number;
  salt_g: number;
  fibre_g: number;
  protein_g: number;
  fruit_veg_nuts_pct: number;
}

export interface NutrientBar {
  key: string;
  label: string;
  value_g: number;
  pct: number;
  level: BarLevel;
  high_is_bad: boolean;
}

export interface IndiaFlag {
  label: string;
  note: string;
}

export interface Nova {
  group: number; // 0 unknown, 1 minimally processed, 3 processed, 4 ultra-processed
  label: string;
}

export interface Score {
  overall: number;
  grade: Grade;
  verdict: string;
  positives: string[];
  negatives: string[];
  breakdown: { nutrients: NutrientBar[]; india_flags: IndiaFlag[]; nova?: Nova };
}

export interface Product {
  barcode: string;
  name: string;
  brand: string;
  ingredients: string[];
  nutrition: Nutrition;
  source: Source;
  score: Score;
}

export interface ScanResult {
  source: Source;
  remaining: number;
  product: Product;
}
