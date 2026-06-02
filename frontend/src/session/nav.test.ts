import { describe, it, expect } from "vitest";
import { navDepth, unwindTo, type NavState } from "./nav";

const home: NavState = { view: "home", hasResult: false, hasCompare: false };

describe("navDepth", () => {
  it("home is depth 0", () => {
    expect(navDepth(home)).toBe(0);
  });
  it("scan / history / result are depth 1", () => {
    expect(navDepth({ ...home, view: "scan" })).toBe(1);
    expect(navDepth({ ...home, view: "history" })).toBe(1);
    expect(navDepth({ ...home, hasResult: true })).toBe(1);
  });
  it("compare is depth 2 and wins over everything", () => {
    expect(navDepth({ view: "history", hasResult: true, hasCompare: true })).toBe(2);
  });
});

describe("unwindTo", () => {
  it("depth 0 returns home with nothing open", () => {
    const s: NavState = { view: "history", hasResult: true, hasCompare: true };
    expect(unwindTo(s, 0)).toEqual(home);
  });
  it("depth 1 clears compare but keeps result/view (compare -> result)", () => {
    const s: NavState = { view: "home", hasResult: true, hasCompare: true };
    expect(unwindTo(s, 1)).toEqual({ view: "home", hasResult: true, hasCompare: false });
  });
  it("result unwinds to home at depth 0", () => {
    expect(unwindTo({ view: "scan", hasResult: true, hasCompare: false }, 0)).toEqual(home);
  });
  it("negative/zero depth is treated as home", () => {
    expect(unwindTo({ view: "scan", hasResult: false, hasCompare: false }, -1)).toEqual(home);
  });
});
