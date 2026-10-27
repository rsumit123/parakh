import type { LogEntry, Meal } from "../api/diet";

export const MEALS: { key: Meal; label: string; icon: string }[] = [
  { key: "breakfast", label: "Breakfast", icon: "🌅" },
  { key: "lunch", label: "Lunch", icon: "🍛" },
  { key: "snack", label: "Snacks", icon: "🍪" },
  { key: "dinner", label: "Dinner", icon: "🌙" },
];

/** Best-guess meal for a local time: breakfast until 11, lunch until 4 pm, snacks
 * until 7 pm, dinner after (and in the small hours). Users can always change it. */
export function mealForTime(d: Date = new Date()): Meal {
  const h = d.getHours();
  if (h >= 4 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 16 && h < 19) return "snack";
  return "dinner";
}

/** An entry's meal: its saved slot, else (older entries) guessed from when it was logged. */
export function entryMeal(e: Pick<LogEntry, "meal" | "created_at">): Meal {
  if (e.meal) return e.meal;
  return e.created_at ? mealForTime(new Date(e.created_at)) : "snack";
}
