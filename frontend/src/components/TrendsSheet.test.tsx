import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TrendsSheet } from "./TrendsSheet";
import * as api from "../api/diet";

const T = { energy_kj: 8368, sugars_g: 50, sat_fat_g: 22, salt_g: 5, fibre_g: 30, protein_g: 50, carbs_g: 250, fat_g: 67 };
const day = (date: string, kj: number, protein: number, salt = 0) => ({ date, count: kj ? 2 : 0, partial: [],
  totals: { energy_kj: kj, sugars_g: 0, sat_fat_g: 0, salt_g: salt, fibre_g: 0, protein_g: protein, carbs_g: 0, fat_g: 0 } });

describe("TrendsSheet", () => {
  beforeEach(() => {
    vi.spyOn(api, "getHistory").mockImplementation(async (_t, n) => ({ targets: T, days: [
      day("2026-10-25", 0, 0), day("2026-10-26", 4184, 40, 4.4), day("2026-10-27", 8368, 60, 5.5)].slice(-n) }));
  });

  it("charts every nutrient with averages over logged days only", async () => {
    render(<TrendsSheet token="t" today="2026-10-27" onClose={() => {}} />);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(8));
    expect(api.getHistory).toHaveBeenCalledWith("t", 7, "2026-10-27");
    expect(screen.getByText(/Averages over 2 logged days/)).toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();  // kcal avg, empty day ignored
    expect(screen.getByText("50")).toBeInTheDocument();     // protein avg
    expect(screen.getByText("5")).toBeInTheDocument();      // salt avg to 0.1 g (4.95 → 5)
  });

  it("one touch reads that day on every chart; range switch refetches", async () => {
    render(<TrendsSheet token="t" today="2026-10-27" onClose={() => {}} />);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(8));
    const kcal = screen.getAllByRole("img")[0];
    kcal.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 96, right: 300, bottom: 96, x: 0, y: 0, toJSON: () => {} });
    fireEvent.pointerDown(kcal, { clientX: 290 });
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("2,000")).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();  // protein follows the same day
    fireEvent.click(screen.getByRole("tab", { name: "30d" }));
    await waitFor(() => expect(api.getHistory).toHaveBeenCalledWith("t", 30, "2026-10-27"));
  });
});
