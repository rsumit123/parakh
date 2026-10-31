import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FoodSheet } from "./FoodSheet";

const M = { energy_kj: 4184, sugars_g: 10, sat_fat_g: 2, salt_g: 1, fibre_g: 4, protein_g: 20 , carbs_g: 0, fat_g: 0};

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

  it("blank carbs/fat mean unknown (null), not zero", () => {
    const onSave = vi.fn();
    render(<FoodSheet mode="add" onSave={onSave} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("Food name"), { target: { value: "Upma" } });
    fireEvent.change(screen.getByLabelText("Carbs in g"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(onSave.mock.calls[0][0].macros.carbs_g).toBe(30);
    expect(onSave.mock.calls[0][0].macros.fat_g).toBeNull();
  });
});


describe("FoodSheet pieces", () => {
  it("edits counted foods in pieces, rescaling grams, nutrients and the name", () => {
    const onSave = vi.fn();
    const macros = { energy_kj: 648.5, protein_g: 12.6, carbs_g: 1.1, fat_g: 10.6, fibre_g: 0, sugars_g: 1.1, sat_fat_g: 3.3, salt_g: 0.3 };
    render(<FoodSheet mode="edit" initial={{ name: "Boiled eggs ×2", grams: 100, macros, meal: "breakfast" }}
      onSave={onSave} onCancel={() => {}} />);
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    expect(screen.getByText("~50 g each")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "One more" }));
    expect(screen.getByLabelText("Food name")).toHaveValue("Boiled eggs ×3");
    expect(screen.getByLabelText("Protein in g")).toHaveValue(18.9);
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: "Boiled eggs ×3", grams: 150 });
  });
});
