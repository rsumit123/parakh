/** Default name for a logged meal, built from its dishes instead of a generic
 * "Thali": "Dal Tadka", "Dal Tadka + Roti", "Dal Tadka, Roti + 2 more". */
export function defaultMealName(names: string[]): string {
  const n = names.map((s) => s.trim()).filter(Boolean);
  if (n.length === 0) return "Meal";
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} + ${n[1]}`;
  return `${n[0]}, ${n[1]} + ${n.length - 2} more`;
}
