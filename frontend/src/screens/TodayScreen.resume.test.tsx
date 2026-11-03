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
