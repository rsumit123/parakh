import { describe, it, expect } from "vitest";
import { mealForTime, entryMeal } from "./meals";

const at = (h: number) => new Date(2026, 9, 27, h, 30);

describe("meals", () => {
  it("guesses the meal from the local hour", () => {
    expect(mealForTime(at(8))).toBe("breakfast");
    expect(mealForTime(at(13))).toBe("lunch");
    expect(mealForTime(at(17))).toBe("snack");
    expect(mealForTime(at(21))).toBe("dinner");
    expect(mealForTime(at(1))).toBe("dinner");
  });
  it("uses the saved meal, else the logged time", () => {
    expect(entryMeal({ meal: "lunch", created_at: null })).toBe("lunch");
    expect(entryMeal({ meal: null, created_at: at(8).toISOString() })).toBe("breakfast");
    expect(entryMeal({ meal: null, created_at: null })).toBe("snack");
  });
});
