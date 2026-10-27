import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WeekChart } from "./WeekChart";

const day = (date: string, kj: number) => ({ date, count: kj ? 1 : 0,
  totals: { energy_kj: kj, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0 } });

describe("WeekChart", () => {
  it("labels days, shows only the selected value, and selects on tap", () => {
    const onSelect = vi.fn();
    render(<WeekChart days={[day("2026-10-26", 4184), day("2026-10-27", 8368)]} targetKj={8368}
      selected="2026-10-27" today="2026-10-27" onSelect={onSelect} />);
    expect(screen.getByText("Calories · last 2 days")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today: 2000 kcal" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("1000")).not.toBeInTheDocument();  // unselected day: no number
    fireEvent.click(screen.getByRole("button", { name: "Yesterday: 1000 kcal" }));
    expect(onSelect).toHaveBeenCalledWith("2026-10-26");
  });
});
