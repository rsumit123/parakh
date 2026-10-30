import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FoodPicker } from "./FoodPicker";
import { AddFoodSheet } from "./AddFoodSheet";
import * as api from "../api/diet";

const per = (kcal: number, p: number) => ({ energy_kj: kcal * 4.184, protein_g: p, carbs_g: 20, fat_g: 1,
  fibre_g: 1, sugars_g: 0, sat_fat_g: 0, salt_g: 0 });
const IDLI: api.RefFood = { id: "idli", name: "Idli", aliases: [], unit_g: 40, default_g: 120, min_g: 20, max_g: 600, per100g: per(130, 4) };
const RICE: api.RefFood = { id: "rice", name: "Rice", aliases: ["chawal"], unit_g: null, default_g: 200, min_g: 50, max_g: 500, per100g: per(130, 2.7) };

vi.mock("../api/diet", async (orig) => ({ ...(await orig()), getFoods: vi.fn(), getRecent: vi.fn() }));

describe("FoodPicker", () => {
  it("counts pieces and logs the name with the count", () => {
    const onAdd = vi.fn();
    render(<FoodPicker food={IDLI} meal="breakfast" onAdd={onAdd} onCancel={() => {}} />);
    expect(screen.getByText("156")).toBeInTheDocument();          // 3 idli = 120 g = 156 kcal
    fireEvent.click(screen.getByRole("button", { name: "One fewer" }));
    expect(screen.getByText("104")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Idli ×2" }));
    expect(onAdd).toHaveBeenCalledWith({ name: "Idli ×2", grams: 80, per100g: IDLI.per100g, meal: "breakfast" });
  });

  it("uses servings or grams for foods that aren't pieces", () => {
    const onAdd = vi.fn();
    render(<FoodPicker food={RICE} meal="lunch" onAdd={onAdd} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /1½/ }));
    expect(screen.getByLabelText("Amount in grams")).toHaveValue(300);
    fireEvent.change(screen.getByLabelText("Amount in grams"), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Rice" }));
    expect(onAdd.mock.calls[0][0]).toMatchObject({ name: "Rice", grams: 250, meal: "lunch" });
  });
});

describe("AddFoodSheet search", () => {
  it("finds common foods by name or other name, and your own foods first", async () => {
    vi.mocked(api.getFoods).mockResolvedValue([IDLI, RICE]);
    vi.mocked(api.getRecent).mockResolvedValue({ items: [{ name: "Rice + dal", brand: "", barcode: null, kind: "unpackaged",
      quantity_g: 300, per100g: per(120, 4), uses: 3 } as unknown as api.RecentFood] });
    const onFood = vi.fn();
    render(<AddFoodSheet token="t" onSnap={() => {}} onManual={() => {}} onQuickAdd={() => {}} onPick={() => {}}
      onFood={onFood} onClose={() => {}} />);
    await waitFor(() => expect(api.getFoods).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Search foods"), { target: { value: "rice" } });
    expect(await screen.findByText("Your foods")).toBeInTheDocument();
    expect(screen.getByText("Rice + dal")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search foods"), { target: { value: "chawal" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Rice" }));
    expect(onFood).toHaveBeenCalledWith(RICE);
    fireEvent.change(screen.getByLabelText("Search foods"), { target: { value: "pizza" } });
    expect(screen.getByText(/No match for/)).toBeInTheDocument();
  });
});
