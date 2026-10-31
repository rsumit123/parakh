import { describe, it, expect } from "vitest";
import { searchFoods, portionName, parseCount } from "./foodSearch";
import type { RefFood } from "../api/diet";

const M = { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
const f = (id: string, name: string, aliases: string[] = [], unit_g: number | null = null): RefFood =>
  ({ id, name, aliases, unit_g, default_g: 100, min_g: 20, max_g: 600, per100g: M });
const FOODS = [f("roti", "Roti", ["chapati"], 40), f("paneer_tikka", "Paneer Tikka"), f("palak_paneer", "Palak Paneer"),
  f("curd", "Curd", ["dahi"]), f("curd_rice", "Curd Rice"), f("idli", "Idli", [], 40), f("dal_tadka", "Dal Tadka", ["dal"])];

describe("searchFoods", () => {
  it("ranks name prefix, then word prefix, then substring", () => {
    expect(searchFoods(FOODS, "paneer").map((x) => x.id)).toEqual(["paneer_tikka", "palak_paneer"]);
    expect(searchFoods(FOODS, "curd").map((x) => x.id)).toEqual(["curd", "curd_rice"]);
    expect(searchFoods(FOODS, "  IDLI ").map((x) => x.id)).toEqual(["idli"]);
  });
  it("finds foods by other names", () => {
    expect(searchFoods(FOODS, "chapati")[0].id).toBe("roti");
    expect(searchFoods(FOODS, "dahi")[0].id).toBe("curd");
    expect(searchFoods(FOODS, "dal")[0].id).toBe("dal_tadka");
  });
  it("returns nothing for an empty or unknown query", () => {
    expect(searchFoods(FOODS, "")).toEqual([]);
    expect(searchFoods(FOODS, "pizza")).toEqual([]);
  });
  it("names pieces with a count", () => {
    expect(portionName(FOODS[5], 2)).toBe("Idli ×2");
    expect(portionName(FOODS[3], null)).toBe("Curd");
  });
  it("reads a piece count from a name", () => {
    expect(parseCount("Roti ×4")).toEqual({ base: "Roti", count: 4 });
    expect(parseCount("Boiled eggs x2")).toEqual({ base: "Boiled eggs", count: 2 });
    expect(parseCount("Dal Tadka (katori)")).toBeNull();
    expect(parseCount("Roti ×0")).toBeNull();
  });
});
