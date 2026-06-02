import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryScreen } from "./CategoryScreen";
import * as catalog from "../api/catalog";

afterEach(() => vi.restoreAllMocks());

const prod = (name: string, grade = "A") => ({ barcode: name, name, brand: "Br", source: "amazon", ingredients: [], category: "drinks",
  nutrition: { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, fruit_veg_nuts_pct: 0 },
  score: { overall: 80, grade, verdict: "", positives: [], negatives: [], breakdown: { nutrients: [], india_flags: [] } } });

describe("CategoryScreen", () => {
  it("loads and renders a product grid for the category", async () => {
    const spy = vi.spyOn(catalog, "fetchCatalogProducts").mockResolvedValue({ items: [prod("Coconut Water") as never], total: 1 });
    render(<CategoryScreen token="t" category="drinks" onOpenProduct={vi.fn()} onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Coconut Water")).toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith("t", expect.objectContaining({ category: "drinks", limit: 200 }));
  });

  it("selecting a grade chip refetches with that grade", async () => {
    const spy = vi.spyOn(catalog, "fetchCatalogProducts").mockResolvedValue({ items: [], total: 0 });
    render(<CategoryScreen token="t" category="drinks" onOpenProduct={vi.fn()} onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "A" }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith("t", expect.objectContaining({ category: "drinks", grade: "A" })));
  });

  it("calls onBack", async () => {
    vi.spyOn(catalog, "fetchCatalogProducts").mockResolvedValue({ items: [], total: 0 });
    const onBack = vi.fn();
    render(<CategoryScreen token="t" category="drinks" onOpenProduct={vi.fn()} onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows a skeleton grid while products load", () => {
    vi.spyOn(catalog, "fetchCatalogProducts").mockReturnValue(new Promise(() => {}));
    render(<CategoryScreen token="t" category="drinks" onOpenProduct={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByTestId("category-loading")).toBeInTheDocument();
  });
});
