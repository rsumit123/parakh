import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfirmMealScreen } from "./ConfirmMealScreen";
import type { MealEstimate } from "../api/diet";

const macro = (p: number) => ({ energy_kj: 500, sugars_g: 2, sat_fat_g: 1, salt_g: 0.3, fibre_g: 2, protein_g: p , carbs_g: 0, fat_g: 0});

describe("ConfirmMealScreen", () => {
  it("single item: confirms with that item's grams + edited name", () => {
    const est: MealEstimate = { items: [{ name: "Dal Rice", portion_g: 350, per100g: macro(4) }] };
    const onConfirm = vi.fn();
    render(<ConfirmMealScreen estimate={est} onConfirm={onConfirm} onBack={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("Dal Rice"), { target: { value: "Dal Chawal" } });
    fireEvent.click(screen.getByRole("button", { name: /add to today/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ name: "Dal Chawal", quantity_g: 350, kind: "unpackaged" }));
  });

  it("multi item: logs the dishes as one grouped meal, named after them", () => {
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
    expect(body.name).toBe("Dal + Jeera Rice");          // named after its dishes, not "Thali"
    expect(body.items.map((i: { name: string; quantity_g: number }) => [i.name, i.quantity_g])).toEqual([["Dal", 200], ["Jeera Rice", 250]]);
    expect(body.items[0].per100g.protein_g).toBe(9);      // each dish keeps its own nutrition
    expect(["breakfast", "lunch", "snack", "dinner"]).toContain(body.meal);
  });

  it("multi item: counted dishes are edited in pieces and named with the count", () => {
    const est: MealEstimate = { items: [
      { name: "Roti", portion_g: 160, per100g: macro(9), count: 4 },
      { name: "Dal", portion_g: 200, per100g: macro(6) },
    ] };
    const onConfirm = vi.fn();
    render(<ConfirmMealScreen estimate={est} onConfirm={onConfirm} onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText("Roti pieces"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /add to today/i }));
    expect(onConfirm.mock.calls[0][0].items[0]).toMatchObject({ name: "Roti ×3", quantity_g: 120 });
  });

  it("shows the captured photo when imageUrl is provided", () => {
    const est: MealEstimate = { items: [{ name: "Dal", portion_g: 200, per100g: macro(9) }] };
    render(<ConfirmMealScreen estimate={est} imageUrl="blob:abc" onConfirm={() => {}} onBack={() => {}} />);
    expect(screen.getByAltText("Your meal")).toBeInTheDocument();
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
    // one dish left: a plain single entry, not a group
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ name: "Dal", quantity_g: 200 });
  });

  it("uploads the photo on open and attaches its key when adding", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Blob(["img"])));
    const est: MealEstimate = { items: [{ name: "Dal", portion_g: 200, per100g: macro(9) }] };
    const onUpload = vi.fn(() => Promise.resolve("meals/user-1/abc.jpg"));
    const onConfirm = vi.fn();
    render(<ConfirmMealScreen estimate={est} imageUrl="blob:abc" onConfirm={onConfirm} onBack={() => {}}
      onUploadPhoto={onUpload} />);
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /add to today/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0][0].photo_key).toBe("meals/user-1/abc.jpg");
    fetchSpy.mockRestore();
  });

  it("still logs the meal (without a photo) if the upload fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Blob(["img"])));
    const est: MealEstimate = { items: [{ name: "Dal", portion_g: 200, per100g: macro(9) }] };
    const onConfirm = vi.fn();
    render(<ConfirmMealScreen estimate={est} imageUrl="blob:abc" onConfirm={onConfirm} onBack={() => {}}
      onUploadPhoto={() => Promise.reject(new Error("offline"))} />);
    fireEvent.click(screen.getByRole("button", { name: /add to today/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0][0].photo_key).toBeUndefined();
    fetchSpy.mockRestore();
  });
});

