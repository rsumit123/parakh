import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WeekChart } from "./WeekChart";

const T = { energy_kj: 8368, sugars_g: 50, sat_fat_g: 22, salt_g: 5, fibre_g: 30, protein_g: 50, carbs_g: 250, fat_g: 67 };
const day = (date: string, kj: number, protein = 0, partial: ("carbs_g" | "fat_g")[] = []) => ({ date, count: kj ? 1 : 0,
  totals: { energy_kj: kj, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: protein, carbs_g: 120, fat_g: 0 },
  partial });
const props = { targets: T, onMetric: () => {}, today: "2026-10-27", onSelect: () => {}, onExpand: () => {} };

// jsdom has no layout: give the plot a 300px-wide box so touches map to days.
function sized() {
  const svg = screen.getByRole("img");
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 150, right: 300, bottom: 150, x: 0, y: 0, toJSON: () => {} });
  return svg;
}

describe("WeekChart", () => {
  it("shows the selected day's value, and any day's on touch with a way to open it", () => {
    const onSelect = vi.fn();
    render(<WeekChart {...props} days={[day("2026-10-26", 4184), day("2026-10-27", 8368)]}
      metric="energy_kj" selected="2026-10-27" onSelect={onSelect} />);
    expect(screen.getByText("Calories · last 2 days")).toBeInTheDocument();
    expect(screen.getByText("target 2000 kcal")).toBeInTheDocument();
    expect(screen.getByText("2,000 kcal")).toBeInTheDocument();
    expect(screen.getByText("Today · 100% of target")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open ›" })).not.toBeInTheDocument();  // already open

    fireEvent.pointerDown(sized(), { clientX: 40 });  // left half = yesterday
    expect(screen.getByText("1,000 kcal")).toBeInTheDocument();
    expect(screen.getByText("Yesterday · 50% of target")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open ›" }));
    expect(onSelect).toHaveBeenCalledWith("2026-10-26");
  });

  it("drags across days and steps with arrow keys", () => {
    render(<WeekChart {...props} days={[day("2026-10-25", 4184), day("2026-10-26", 6276), day("2026-10-27", 8368)]}
      metric="energy_kj" selected="2026-10-27" />);
    const svg = sized();
    fireEvent.pointerDown(svg, { clientX: 290 });
    fireEvent.pointerMove(svg, { clientX: 150 });
    expect(screen.getByText("1,500 kcal")).toBeInTheDocument();
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(screen.getByText("1,000 kcal")).toBeInTheDocument();
  });

  it("treats a day with nothing logged as a gap, not zero", () => {
    render(<WeekChart {...props} days={[day("2026-10-26", 0), day("2026-10-27", 8368)]}
      metric="energy_kj" selected="2026-10-27" />);
    fireEvent.pointerDown(sized(), { clientX: 10 });
    expect(screen.getByText("Nothing logged")).toBeInTheDocument();
  });

  it("switches nutrient: protein shows grams against a goal; expand opens trends", () => {
    const onMetric = vi.fn(), onExpand = vi.fn();
    render(<WeekChart {...props} days={[day("2026-10-27", 8368, 42)]} onMetric={onMetric} onExpand={onExpand}
      metric="protein_g" selected="2026-10-27" />);
    expect(screen.getByText("goal 50 g")).toBeInTheDocument();
    expect(screen.getByText("42 g")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Carbs" }));
    expect(onMetric).toHaveBeenCalledWith("carbs_g");
    fireEvent.click(screen.getByRole("button", { name: "All nutrients, full screen" }));
    expect(onExpand).toHaveBeenCalled();
  });

  it("marks days whose carb data is incomplete", () => {
    render(<WeekChart {...props} days={[day("2026-10-27", 8368, 0, ["carbs_g"])]}
      metric="carbs_g" selected="2026-10-27" />);
    expect(screen.getByText("120+ g")).toBeInTheDocument();
    expect(screen.getByText(/no carbs data/i)).toBeInTheDocument();
  });
});
