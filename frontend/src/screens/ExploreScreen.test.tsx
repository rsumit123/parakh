import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExploreScreen } from "./ExploreScreen";
import * as catalog from "../api/catalog";

afterEach(() => vi.restoreAllMocks());

const prod = (over: object) => ({ barcode: "b", name: "N", brand: "Br", source: "amazon", ingredients: [],
  nutrition: { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, fruit_veg_nuts_pct: 0 },
  score: { overall: 50, grade: "C", verdict: "", positives: [], negatives: [], breakdown: { nutrients: [], india_flags: [] } }, ...over });

describe("ExploreScreen", () => {
  it("renders category tiles with counts", async () => {
    vi.spyOn(catalog, "fetchCategories").mockResolvedValue({ categories: [{ category: "drinks", count: 90 }, { category: "namkeen", count: 74 }] });
    const onOpenCategory = vi.fn();
    render(<ExploreScreen token="t" onOpenCategory={onOpenCategory} onOpenProduct={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("drinks")).toBeInTheDocument());
    expect(screen.getByText(/90/)).toBeInTheDocument();
    await userEvent.click(screen.getByText("drinks"));
    expect(onOpenCategory).toHaveBeenCalledWith("drinks");
  });

  it("typing shows search results from the products API", async () => {
    vi.spyOn(catalog, "fetchCategories").mockResolvedValue({ categories: [] });
    vi.spyOn(catalog, "fetchCatalogProducts").mockResolvedValue({ items: [prod({ name: "Amul Buttermilk" }) as never], total: 1 });
    const onOpenProduct = vi.fn();
    render(<ExploreScreen token="t" onOpenCategory={vi.fn()} onOpenProduct={onOpenProduct} />);
    await userEvent.type(screen.getByPlaceholderText(/search/i), "amul");
    await waitFor(() => expect(screen.getByText("Amul Buttermilk")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Amul Buttermilk"));
    expect(onOpenProduct).toHaveBeenCalled();
  });

  it("shows a skeleton while categories load", () => {
    vi.spyOn(catalog, "fetchCategories").mockReturnValue(new Promise(() => {}));
    render(<ExploreScreen token="t" onOpenCategory={vi.fn()} onOpenProduct={vi.fn()} />);
    expect(screen.getByTestId("explore-loading")).toBeInTheDocument();
  });
});
