import { describe, it, expect } from "vitest";
import { gradeColor, gradeTone, barColor } from "./grade";

describe("grade presentation", () => {
  it("maps good grades to green and bad to red", () => {
    expect(gradeColor("A")).toBe("var(--green)");
    expect(gradeColor("E")).toBe("var(--red)");
  });
  it("gives a tone class per grade", () => {
    expect(gradeTone("A")).toBe("good");
    expect(gradeTone("C")).toBe("ok");
    expect(gradeTone("E")).toBe("bad");
  });
  it("colors bars by level and direction", () => {
    expect(barColor("high", true)).toBe("var(--red)");   // high & bad
    expect(barColor("high", false)).toBe("var(--green)"); // high & good (e.g. protein)
    expect(barColor("low", true)).toBe("var(--green)");   // low & bad-nutrient = good
  });
});
