import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MealGroupSheet } from "./MealGroupSheet";
import type { LogEntry } from "../api/diet";

const dish = (id: number, name: string, g: number, kcal: number, image_url = ""): LogEntry => ({
  id, day: "2026-10-31", kind: "unpackaged", barcode: null, name, brand: "", quantity_g: g, image_url,
  meal: "lunch", created_at: null, group_id: "g1", group_name: "Roti, Dal + 1 more",
  energy_kj: kcal * 4.184, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 10, carbs_g: 0, fat_g: 0 });
const DISHES = [dish(1, "Roti ×4", 160, 422, "https://signed/x.jpg"), dish(2, "Dal Tadka", 200, 240), dish(3, "Bhindi Fry", 120, 180)];

describe("MealGroupSheet", () => {
  it("lists each dish with pieces or grams, and edits one", () => {
    const onEditDish = vi.fn(), onDeleteMeal = vi.fn();
    render(<MealGroupSheet name="Roti, Dal + 1 more" entries={DISHES} onEditDish={onEditDish}
      onRemoveDish={() => {}} onDeleteMeal={onDeleteMeal} onClose={() => {}} />);
    expect(screen.getByText("842 kcal · 30 g protein · tap a dish to fix it")).toBeInTheDocument();
    expect(screen.getByText("4 pcs")).toBeInTheDocument();
    expect(screen.getByText("200 g")).toBeInTheDocument();
    expect(screen.getByAltText("Your meal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Roti ×4" }));
    expect(onEditDish).toHaveBeenCalledWith(DISHES[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete meal" }));
    expect(onDeleteMeal).toHaveBeenCalled();
  });
});

import { MealSuggestions } from "./MealSuggestions";
import type { MealSuggestion } from "../api/diet";

describe("MealSuggestions", () => {
  const s = (name: string, kcal: number, times = 1): MealSuggestion => ({ source_day: "2026-11-02", times, entry_ids: [kcal],
    items: [{ name, quantity_g: 100, kcal }], kcal, protein_g: 10 });
  it("shows one compact line and keeps other options behind More", () => {
    const onAdd = vi.fn();
    render(<MealSuggestions slotLabel="Breakfast" suggestions={[s("Idli ×2", 484, 2), s("Poha", 400)]} busy={false} onAdd={onAdd} />);
    expect(screen.getByText("↻ Usual breakfast")).toBeInTheDocument();
    expect(screen.queryByText("Poha")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Breakfast: Poha" }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ kcal: 400 }));
  });
});
