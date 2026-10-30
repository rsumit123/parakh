import { describe, it, expect } from "vitest";
import { plan, DEFAULT_PREFS, type ReminderPrefs } from "./reminders";

const ON: ReminderPrefs = { ...DEFAULT_PREFS, enabled: true };
const at = (d: Date) => `${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

describe("plan reminders", () => {
  it("is empty when switched off", () => {
    expect(plan(DEFAULT_PREFS, new Set(), new Date(2026, 9, 31, 8))).toEqual([]);
  });
  it("plans a week, skipping today's passed and already-logged meals", () => {
    const now = new Date(2026, 9, 31, 12, 0);   // noon: breakfast passed
    const p = plan(ON, new Set(["lunch"]), now);  // lunch already logged
    expect(p.slice(0, 2).map((x) => `${x.meal} ${at(x.at)}`)).toEqual(["dinner 31 21:00", "breakfast 1 09:30"]);
    expect(p).toHaveLength(1 + 6 * 3);
    expect(new Set(p.map((x) => x.id)).size).toBe(p.length);  // unique ids
  });
  it("respects per-meal switches and times", () => {
    const prefs: ReminderPrefs = { enabled: true, meals: { ...ON.meals, breakfast: { on: false, time: "09:30" }, dinner: { on: true, time: "20:15" } } };
    const p = plan(prefs, new Set(), new Date(2026, 9, 31, 22));
    expect(p.every((x) => x.meal !== "breakfast")).toBe(true);
    expect(at(p.find((x) => x.meal === "dinner")!.at)).toBe("1 20:15");
  });
});
