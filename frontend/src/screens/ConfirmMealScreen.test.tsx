import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmMealScreen } from "./ConfirmMealScreen";
import type { MealEstimate } from "../api/diet";

const macro = (p: number) => ({ energy_kj: 500, sugars_g: 2, sat_fat_g: 1, salt_g: 0.3, fibre_g: 2, protein_g: p });

describe("ConfirmMealScreen", () => {
  it("single item: confirms with that item's grams + edited name", () => {
    const est: MealEstimate = { items: [{ name: "Dal Rice", portion_g: 350, per100g: macro(4) }] };
    const onConfirm = vi.fn();
    render(<ConfirmMealScreen estimate={est} onConfirm={onConfirm} onBack={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("Dal Rice"), { target: { value: "Dal Chawal" } });
    fireEvent.click(screen.getByRole("button", { name: /add to today/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ name: "Dal Chawal", quantity_g: 350, kind: "unpackaged" }));
  });

  it("multi item: logs ONE combined entry with summed grams + macros", () => {
    const est: MealEstimate = { items: [
      { name: "Dal", portion_g: 200, per100g: macro(9) },
      { name: "Jeera Rice", portion_g: 250, per100g: macro(4) },
    ] };
    const onConfirm = vi.fn();
    render(<ConfirmMealScreen estimate={est} onConfirm={onConfirm} onBack={() => {}} />);
    expect(screen.getByDisplayValue("Dal")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Jeera Rice")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add to today/i }));
    const body = onConfirm.mock.calls[0][0];
    expect(body.quantity_g).toBe(450);                    // 200 + 250
    // summed protein = 9*2 + 4*2.5 = 28g; synthesized per100g must reproduce it
    expect(Math.round(body.per100g.protein_g * body.quantity_g / 100)).toBe(28);
  });

  it("multi item: removing a dish drops it from the total", () => {
    const est: MealEstimate = { items: [
      { name: "Dal", portion_g: 200, per100g: macro(9) },
      { name: "Rice", portion_g: 250, per100g: macro(4) },
    ] };
    const onConfirm = vi.fn();
    render(<ConfirmMealScreen estimate={est} onConfirm={onConfirm} onBack={() => {}} />);
    fireEvent.click(screen.getAllByRole("button", { name: /remove dish/i })[1]);  // remove Rice
    fireEvent.click(screen.getByRole("button", { name: /add to today/i }));
    expect(onConfirm.mock.calls[0][0].quantity_g).toBe(200);
  });
});
