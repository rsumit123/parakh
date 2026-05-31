// Curated, source-cited explanations for why a flag or nutrient is health-relevant.
// Static reference content (no per-scan AI cost, no hallucination risk). Keyed by the
// backend's stable flag labels, nutrient keys, and NOVA group.

export interface Explanation {
  title: string;
  body: string;
  source: string;
  tip: string; // concrete, actionable "what to do" (the E feature)
}

// Keyed by the exact `label` the backend emits in breakdown.india_flags.
const FLAG_EXPLANATIONS: Record<string, Explanation> = {
  "Palm oil": {
    title: "Palm oil",
    body:
      "Palm oil is very high in saturated fat, which raises LDL (“bad”) cholesterol " +
      "and is linked to higher cardiovascular risk. The WHO recommends keeping saturated " +
      "fat below 10% of total daily energy.",
    source: "WHO, Saturated fatty acid intake guideline (2023)",
    tip: "Enjoy occasionally, not daily — and look for variants made with groundnut, sunflower or rice-bran oil.",
  },
  "Refined flour (maida)": {
    title: "Refined flour (maida)",
    body:
      "Maida is wheat stripped of its bran and germ, so it has little fibre and a high " +
      "glycaemic index — it spikes blood sugar faster than whole grains. Diets high in " +
      "refined grains are associated with higher type-2 diabetes and heart-disease risk.",
    source: "Harvard T.H. Chan School of Public Health, Whole Grains (2023)",
    tip: "Pick whole-wheat (atta), oats or millet versions when you can, and pair with protein or veg to soften the sugar spike.",
  },
  Additives: {
    title: "Additives & flavour enhancers",
    body:
      "Flavour enhancers (e.g. MSG/E621), artificial colours and similar additives are " +
      "markers of ultra-processed food. Higher intake of ultra-processed foods is associated " +
      "with increased risk of obesity, heart disease and other conditions.",
    source: "BMJ, Ultra-processed foods and health outcomes (2024)",
    tip: "Treat as an occasional snack. Whole or home-made alternatives skip these additives entirely.",
  },
};

// Keyed by nutrient `key` from breakdown.nutrients (only the high-is-bad ones get a 'why').
const NUTRIENT_EXPLANATIONS: Record<string, Explanation> = {
  sugars: {
    title: "Sugar",
    body:
      "High intake of free sugars contributes to weight gain and dental caries, and raises " +
      "the risk of type-2 diabetes. The WHO recommends free sugars stay under 10% (ideally " +
      "5%) of daily energy — about 25g.",
    source: "WHO, Sugars intake for adults and children (2015)",
    tip: "Keep the portion small and avoid stacking it with other sweet items the same day.",
  },
  sat_fat: {
    title: "Saturated fat",
    body:
      "Saturated fat raises LDL cholesterol, a major driver of heart disease and stroke. " +
      "The WHO advises limiting it to under 10% of daily energy and replacing it with " +
      "unsaturated fats.",
    source: "WHO, Saturated fatty acid intake guideline (2023)",
    tip: "Balance it with a meal rich in fibre and unsaturated fats (nuts, seeds), and keep portions modest.",
  },
  salt: {
    title: "Salt",
    body:
      "Too much salt raises blood pressure, the leading risk factor for heart disease and " +
      "stroke. The WHO recommends less than 5g of salt per day for adults.",
    source: "WHO, Sodium intake guideline (2025)",
    tip: "Drink plenty of water and go easy on other salty foods today. A low-sodium variant is a smart swap.",
  },
};

const NOVA4_EXPLANATION: Explanation = {
  title: "Ultra-processed (NOVA 4)",
  body:
    "NOVA classifies foods by how industrially processed they are. Group 4 — " +
    "ultra-processed — contains industrial ingredients and additives rarely used in home " +
    "cooking. Large studies link higher ultra-processed food intake to higher risk of " +
    "obesity, cardiovascular disease and early mortality.",
  source: "BMJ, Ultra-processed foods and health outcomes (2024)",
  tip: "Best as an occasional treat. A whole-food or home-made option is the healthier everyday choice.",
};

/** Look up an explanation for a result-screen reason chip, or null if none. */
export function explanationForReason(reason: string): Explanation | null {
  // Exact flag-label match first (e.g. "Palm oil", "Additives").
  if (FLAG_EXPLANATIONS[reason]) return FLAG_EXPLANATIONS[reason];
  // Nutrient negatives arrive as "High sugar" / "High saturated fat" / "High salt".
  const lower = reason.toLowerCase();
  if (lower.includes("sugar")) return NUTRIENT_EXPLANATIONS.sugars;
  if (lower.includes("saturated")) return NUTRIENT_EXPLANATIONS.sat_fat;
  if (lower.includes("salt")) return NUTRIENT_EXPLANATIONS.salt;
  return null;
}

export function explanationForNutrientKey(key: string): Explanation | null {
  return NUTRIENT_EXPLANATIONS[key] ?? null;
}

export function explanationForNova(group: number): Explanation | null {
  return group === 4 ? NOVA4_EXPLANATION : null;
}
