import { describe, it, expect } from "vitest";
import { addDays, dayTitle, weekdayLetter } from "./dates";

describe("dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("titles today and yesterday by name", () => {
    expect(dayTitle("2026-10-27", "2026-10-27")).toBe("Today");
    expect(dayTitle("2026-10-26", "2026-10-27")).toBe("Yesterday");
    expect(dayTitle("2026-10-20", "2026-10-27")).toMatch(/20/);
  });
  it("gives weekday letters", () => {
    expect(weekdayLetter("2026-10-26")).toBe("M"); // a Monday
  });
});
