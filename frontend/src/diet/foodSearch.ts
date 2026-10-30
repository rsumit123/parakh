import type { RefFood } from "../api/diet";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Best matches for what the user typed: names first, then aliases ("chapati" finds
 * Roti, "dahi" finds Curd). Whole-name prefix beats word prefix beats substring. */
export function searchFoods(foods: RefFood[], query: string, limit = 12): RefFood[] {
  const q = norm(query);
  if (!q) return [];
  const score = (text: string): number => {
    const t = norm(text);
    if (t === q) return 0;
    if (t.startsWith(q)) return 1;
    if (t.split(" ").some((w) => w.startsWith(q))) return 2;
    return t.includes(q) ? 3 : 99;
  };
  return foods
    .map((f, i) => ({ f, i, s: Math.min(score(f.name), ...f.aliases.map((a) => score(a) + 0.5)) }))
    .filter((x) => x.s < 99)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.f);
}

/** Entry name for an amount: "Idli ×2" for pieces, else the plain name. */
export function portionName(f: RefFood, count: number | null): string {
  return f.unit_g && count ? `${f.name} ×${count}` : f.name;
}
