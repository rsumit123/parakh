import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GapIdeas } from "./GapIdeas";
import type { Gaps } from "../api/diet";

const M = { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
const DATA: Gaps = { gaps: { protein_g: 30, fibre_g: 31 }, kcal_left: 900, ideas: [
  { name: "Boiled eggs ×2", quantity_g: 100, per100g: M, kind: "manual", own: true, kcal: 155, protein_g: 12.6, fibre_g: 0 },
  { name: "Guava", quantity_g: 150, per100g: M, kind: "unpackaged", own: false, kcal: 102, protein_g: 3.9, fibre_g: 8.1 },
] };

describe("GapIdeas", () => {
  it("lists ideas with what they add, and adds one", () => {
    const onAdd = vi.fn();
    render(<GapIdeas data={DATA} onAdd={onAdd} />);
    expect(screen.getByText("30 g protein · 31 g fibre to go")).toBeInTheDocument();
    expect(screen.getByText("you eat this")).toBeInTheDocument();
    expect(screen.getByText("+13 g protein · 155 kcal")).toBeInTheDocument();
    expect(screen.getByText("+4 g protein · +8 g fibre · 102 kcal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Guava" }));
    expect(onAdd).toHaveBeenCalledWith(DATA.ideas[1]);
  });
  it("renders nothing without ideas", () => {
    const { container } = render(<GapIdeas data={{ gaps: {}, kcal_left: 0, ideas: [] }} onAdd={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
