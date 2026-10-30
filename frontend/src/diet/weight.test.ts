import { describe, it, expect } from "vitest";
import { weightChange } from "./weight";

const w = (day: string, kg: number) => ({ day, weight_kg: kg });

describe("weightChange", () => {
  it("compares with the weigh-in nearest a week earlier", () => {
    expect(weightChange([w("2026-10-01", 70), w("2026-10-08", 69.4), w("2026-10-15", 68.9)])).toEqual({ kg: -0.5, overDays: 7 });
    expect(weightChange([w("2026-10-01", 70), w("2026-10-10", 70.3)])).toEqual({ kg: 0.3, overDays: 9 });
  });
  it("needs two readings at least a few days apart", () => {
    expect(weightChange([w("2026-10-15", 68.9)])).toBeNull();
    expect(weightChange([w("2026-10-14", 69), w("2026-10-15", 68.9)])).toBeNull();
  });
});
