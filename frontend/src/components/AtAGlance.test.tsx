import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AtAGlance } from "./AtAGlance";
import type { NutrientBar } from "../api/types";

const bars: NutrientBar[] = [
  { key: "sugars", label: "Sugar", value_g: 2.1, pct: 18, level: "low", high_is_bad: true },
  { key: "protein", label: "Protein", value_g: 6.4, pct: 53, level: "high", high_is_bad: false },
];

describe("AtAGlance", () => {
  it("renders each nutrient with its value and level", () => {
    render(<AtAGlance nutrients={bars} />);
    expect(screen.getByText("Sugar")).toBeInTheDocument();
    expect(screen.getByText("2.1")).toBeInTheDocument();
    expect(screen.getByText("Protein")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
  });

  it("renders nothing when there are no nutrients", () => {
    const { container } = render(<AtAGlance nutrients={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
