import { describe, it, expect, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { TodayScreen } from "./TodayScreen";
import * as api from "../api/diet";

const T = { energy_kj: 8368, sugars_g: 50, sat_fat_g: 22, salt_g: 5, fibre_g: 40, protein_g: 50, carbs_g: 250, fat_g: 67 };
const day = { date: "2026-11-03", entries: [], targets: T, totals: { ...T, energy_kj: 0 }, status: {} as never, headline: "Nothing logged yet" };

vi.mock("../api/diet", async (orig) => ({ ...(await orig()),
  getDay: vi.fn(), getHistory: vi.fn(), getSuggestions: vi.fn(), getGaps: vi.fn(), getWeight: vi.fn() }));

describe("TodayScreen on resume", () => {
  it("refetches the day when the app comes back to the foreground", async () => {
    vi.mocked(api.getDay).mockResolvedValue(day as unknown as api.DietDay);
    vi.mocked(api.getHistory).mockResolvedValue({ targets: T, days: [] });
    vi.mocked(api.getSuggestions).mockResolvedValue({ slots: {} } as never);
    vi.mocked(api.getWeight).mockResolvedValue({ entries: [], latest: null, goal: null });
    render(<TodayScreen token="t" date="2026-11-03" today="2026-11-03" onChangeDate={() => {}}
      onSnapMeal={() => {}} onOpenTargets={() => {}} />);
    await waitFor(() => expect(api.getDay).toHaveBeenCalledTimes(1));
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(api.getDay).toHaveBeenCalledTimes(2));
    expect(api.getSuggestions).toHaveBeenCalledTimes(2);
  });
});

describe("Add food keeps the meal you're in", () => {
  it("a late breakfast stays breakfast after 11 am, and the meal is shown", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 4, 11, 41));             // 11:41 local: the clock alone says lunch
    const eggs = { id: 96, day: "2026-11-04", kind: "unpackaged", barcode: null, name: "Boiled eggs ×2", brand: "",
      quantity_g: 100, image_url: "", meal: "breakfast", created_at: new Date(2026, 10, 4, 11, 20).toISOString(),
      energy_kj: 648, sugars_g: 1, sat_fat_g: 3.3, salt_g: 0.3, fibre_g: 0, protein_g: 12.6, carbs_g: 1, fat_g: 10.6 };
    vi.mocked(api.getDay).mockResolvedValue({ ...day, date: "2026-11-04", entries: [eggs] } as unknown as api.DietDay);
    vi.mocked(api.getHistory).mockResolvedValue({ targets: T, days: [] });
    vi.mocked(api.getSuggestions).mockResolvedValue({ slots: {} } as never);
    vi.mocked(api.getWeight).mockResolvedValue({ entries: [], latest: null, goal: null });
    vi.spyOn(api, "getFoods").mockResolvedValue([]);
    vi.spyOn(api, "getRecent").mockResolvedValue({ items: [{ name: "Masala Chai (1 cup)", brand: "", barcode: null, kind: "unpackaged",
      quantity_g: 150, per100g: { ...T, energy_kj: 196 }, uses: 9 } as unknown as api.RecentFood] });
    const add = vi.spyOn(api, "addLog").mockResolvedValue(
      { ...day, date: "2026-11-04", entries: [eggs], entry: { ...eggs, id: 97 } } as never);
    const { findByRole } = render(<TodayScreen token="t" date="2026-11-04" today="2026-11-04"
      onChangeDate={() => {}} onSnapMeal={() => {}} onOpenTargets={() => {}} />);
    const addFood = await findByRole("button", { name: "＋ Add food" });
    act(() => { addFood.click(); });
    expect(await findByRole("radio", { name: "Breakfast" })).toHaveAttribute("aria-checked", "true");
    const chai = await findByRole("button", { name: "Add Masala Chai (1 cup) again" });
    act(() => { chai.click(); });
    await waitFor(() => expect(add).toHaveBeenCalled());
    expect(add.mock.calls[0][1].meal).toBe("breakfast");
    vi.useRealTimers();
  });
});
