import { describe, it, expect } from "vitest";
import { explanationForReason, explanationForNova, explanationForNutrientKey } from "./explanations";

describe("explanations", () => {
  it("maps a flag label to its cited explanation", () => {
    const e = explanationForReason("Palm oil");
    expect(e).not.toBeNull();
    expect(e!.body.toLowerCase()).toContain("saturated fat");
    expect(e!.source).toMatch(/WHO/);
  });

  it("maps 'High saturated fat' negative to the sat-fat explanation", () => {
    const e = explanationForReason("High saturated fat");
    expect(e!.title).toBe("Saturated fat");
  });

  it("maps 'High sugar' to the sugar explanation", () => {
    expect(explanationForReason("High sugar")!.title).toBe("Sugar");
  });

  it("returns null for an unknown reason (e.g. a positive)", () => {
    expect(explanationForReason("Protein (6.4g)")).toBeNull();
  });

  it("explains NOVA 4 but not other groups", () => {
    expect(explanationForNova(4)).not.toBeNull();
    expect(explanationForNova(1)).toBeNull();
  });

  it("maps a nutrient key to its explanation", () => {
    expect(explanationForNutrientKey("salt")!.title).toBe("Salt");
    expect(explanationForNutrientKey("protein")).toBeNull();
  });
});
