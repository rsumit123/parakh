import { describe, it, expect } from "vitest";
import { defaultMealName } from "./mealName";

describe("defaultMealName", () => {
  it("names a meal after its dishes", () => {
    expect(defaultMealName([])).toBe("Meal");
    expect(defaultMealName(["Dal Tadka"])).toBe("Dal Tadka");
    expect(defaultMealName(["Dal Tadka", "Roti"])).toBe("Dal Tadka + Roti");
    expect(defaultMealName(["Dal Tadka", "Roti", "Dahi", "Achar"])).toBe("Dal Tadka, Roti + 2 more");
    expect(defaultMealName([" ", "Roti"])).toBe("Roti");
  });
});
