import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreRing } from "./ScoreRing";

describe("ScoreRing", () => {
  it("shows the grade letter and score number", () => {
    render(<ScoreRing grade="A" overall={84} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("84 / 100")).toBeInTheDocument();
  });
});
