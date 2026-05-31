import type { Grade, BarLevel } from "../api/types";

export type Tone = "good" | "ok" | "bad";

export function gradeTone(grade: Grade): Tone {
  if (grade === "A" || grade === "B") return "good";
  if (grade === "C") return "ok";
  return "bad";
}

export function gradeColor(grade: Grade): string {
  const tone = gradeTone(grade);
  if (tone === "good") return "var(--green)";
  if (tone === "ok") return "var(--amber)";
  return "var(--red)";
}

// For a nutrient bar: when the nutrient is bad-in-excess (high_is_bad), a high level
// is red and a low level is green; for good nutrients (protein/fibre) it's inverted.
export function barColor(level: BarLevel, highIsBad: boolean): string {
  const bad = highIsBad ? level === "high" : level === "low";
  const good = highIsBad ? level === "low" : level === "high";
  if (bad) return "var(--red)";
  if (good) return "var(--green)";
  return "var(--amber)";
}
