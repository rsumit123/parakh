import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmMealScreen } from "./ConfirmMealScreen";
import type { MealEstimate } from "../api/diet";

const est: MealEstimate = { name: "Dal rice", portion_g: 350,
  per100g: { energy_kj: 500, sugars_g: 2, sat_fat_g: 1, salt_g: 0.3, fibre_g: 2, protein_g: 4 } };

describe("ConfirmMealScreen", () => {
  it("prefills name + portion and confirms with edited values", () => {
    const onConfirm = vi.fn();
    render(<ConfirmMealScreen estimate={est} onConfirm={onConfirm} onBack={() => {}} />);
    const name = screen.getByDisplayValue("Dal rice") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Dal chawal" } });
    fireEvent.click(screen.getByRole("button", { name: /add to today/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ name: "Dal chawal", quantity_g: 350 }));
  });

  it("works blank for manual entry", () => {
    render(<ConfirmMealScreen estimate={null} onConfirm={() => {}} onBack={() => {}} />);
    expect(screen.getByPlaceholderText(/dish name/i)).toBeInTheDocument();
  });

  it("clicking Small re-scales the logged quantity", () => {
    const onConfirm = vi.fn();
    render(<ConfirmMealScreen estimate={est} onConfirm={onConfirm} onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Small" }));
    fireEvent.click(screen.getByRole("button", { name: /add to today/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ quantity_g: 175 }));
  });
});
