import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FoodSheet } from "./FoodSheet";

const M = { energy_kj: 4184, sugars_g: 10, sat_fat_g: 2, salt_g: 1, fibre_g: 4, protein_g: 20 };

describe("FoodSheet", () => {
  it("add mode: needs a name, then returns nutrients for the amount (kcal -> kJ)", () => {
    const onSave = vi.fn();
    render(<FoodSheet mode="add" onSave={onSave} onCancel={() => {}} />);
    const add = screen.getByRole("button", { name: /add/i });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Food name"), { target: { value: "Poha" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("Energy in kcal"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Protein in g"), { target: { value: "6" } });
    fireEvent.click(add);
    const v = onSave.mock.calls[0][0];
    expect(v.name).toBe("Poha");
    expect(v.grams).toBe(150);
    expect(Math.round(v.macros.energy_kj)).toBe(1046);
    expect(v.macros.protein_g).toBe(6);
    expect(v.macros.salt_g).toBe(0);
  });

  it("edit mode: changing the amount rescales nutrients; delete is offered", () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    render(<FoodSheet mode="edit" initial={{ name: "Dal", grams: 200, macros: M }}
      onSave={onSave} onDelete={onDelete} onCancel={() => {}} />);
    expect(screen.getByLabelText("Energy in kcal")).toHaveValue(1000);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "100" } });
    expect(screen.getByLabelText("Energy in kcal")).toHaveValue(500);
    expect(screen.getByLabelText("Protein in g")).toHaveValue(10);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: "Dal", grams: 100 });
    expect(onSave.mock.calls[0][0].macros.protein_g).toBe(10);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalled();
  });
});
