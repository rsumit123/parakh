import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WeekChart } from "./WeekChart";

const T = { energy_kj: 8368, sugars_g: 50, sat_fat_g: 22, salt_g: 5, fibre_g: 30, protein_g: 50, carbs_g: 250, fat_g: 67 };
const day = (date: string, kj: number, protein = 0, partial: ("carbs_g" | "fat_g")[] = []) => ({ date, count: kj ? 1 : 0,
  totals: { energy_kj: kj, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: protein, carbs_g: 120, fat_g: 0 },
  partial });

describe("WeekChart", () => {
  it("labels days, shows only the selected value, and selects on tap", () => {
    const onSelect = vi.fn();
    render(<WeekChart days={[day("2026-10-26", 4184), day("2026-10-27", 8368)]} targets={T}
      metric="energy_kj" onMetric={() => {}} selected="2026-10-27" today="2026-10-27" onSelect={onSelect} />);
    expect(screen.getByText("Calories · last 2 days")).toBeInTheDocument();
    expect(screen.getByText("target 2000 kcal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today: 2000 kcal" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("1000")).not.toBeInTheDocument();  // unselected day: no number
    fireEvent.click(screen.getByRole("button", { name: "Yesterday: 1000 kcal" }));
    expect(onSelect).toHaveBeenCalledWith("2026-10-26");
  });

  it("switches nutrient: protein shows grams against a goal", () => {
    const onMetric = vi.fn();
    render(<WeekChart days={[day("2026-10-27", 8368, 42)]} targets={T}
      metric="protein_g" onMetric={onMetric} selected="2026-10-27" today="2026-10-27" onSelect={() => {}} />);
    expect(screen.getByText("Protein · last 1 days")).toBeInTheDocument();
    expect(screen.getByText("goal 50 g")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today: 42 g" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Carbs" }));
    expect(onMetric).toHaveBeenCalledWith("carbs_g");
  });

  it("marks days whose carb data is incomplete", () => {
    render(<WeekChart days={[day("2026-10-27", 8368, 0, ["carbs_g"])]} targets={T}
      metric="carbs_g" onMetric={() => {}} selected="2026-10-27" today="2026-10-27" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Today: 120 g (incomplete)" })).toBeInTheDocument();
    expect(screen.getByText(/no carbs data/i)).toBeInTheDocument();
  });
});
