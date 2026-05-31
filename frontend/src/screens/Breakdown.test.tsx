import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breakdown } from "./Breakdown";
import type { Score } from "../api/types";

const score: Score = {
  overall: 52, grade: "C", verdict: "Okay sometimes", positives: [], negatives: [],
  breakdown: {
    nutrients: [
      { key: "sugars", label: "Sugar", value_g: 2.1, pct: 18, level: "low", high_is_bad: true },
      { key: "sat_fat", label: "Saturated fat", value_g: 11, pct: 74, level: "high", high_is_bad: true },
    ],
    india_flags: [{ label: "Palm oil", note: "Flagged for India market" }],
  },
};

describe("Breakdown", () => {
  it("renders each nutrient bar with its label and value", () => {
    render(<Breakdown score={score} />);
    expect(screen.getByText("Sugar")).toBeInTheDocument();
    expect(screen.getByText("Saturated fat")).toBeInTheDocument();
    expect(screen.getByText(/2.1\s*g/)).toBeInTheDocument();
  });

  it("renders India flags", () => {
    render(<Breakdown score={score} />);
    expect(screen.getByText("Palm oil")).toBeInTheDocument();
    expect(screen.getByText("Flagged for India market")).toBeInTheDocument();
  });

  it("omits the India flags section when there are none", () => {
    render(<Breakdown score={{ ...score, breakdown: { ...score.breakdown, india_flags: [] } }} />);
    expect(screen.queryByText(/India flags/i)).not.toBeInTheDocument();
  });
});
