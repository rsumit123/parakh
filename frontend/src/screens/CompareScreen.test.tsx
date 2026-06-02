import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompareScreen } from "./CompareScreen";
import type { Product } from "../api/types";

function make(over: Partial<Omit<Product, "nutrition" | "score">> & {
  nutrition?: Partial<Product["nutrition"]>;
  score?: Product["score"];
}): Product {
  const { nutrition, score, ...rest } = over;
  return {
    barcode: "x", name: "Prod", brand: "Brand", source: "amazon", ingredients: [],
    nutrition: { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, fruit_veg_nuts_pct: 0, ...(nutrition ?? {}) },
    score: { overall: 0, grade: "C", verdict: "", positives: [], negatives: [],
             breakdown: { nutrients: [], india_flags: [], nova: { group: 0, label: "Unknown" } }, ...(score ?? {}) },
    ...rest,
  } as Product;
}

const kurkure = make({
  name: "Kurkure", brand: "PepsiCo", image_url: "https://img/k.jpg",
  nutrition: { energy_kj: 2326, sugars_g: 1.7, sat_fat_g: 15.2, salt_g: 1.7, fibre_g: 0, protein_g: 6.4 },
  score: { overall: 21, grade: "D", verdict: "", positives: [], negatives: [],
           breakdown: { nutrients: [], india_flags: [{ label: "Palm oil", note: "" }], nova: { group: 4, label: "Ultra-processed" } } },
});
const makhana = make({
  name: "Makhana", brand: "Farmley",
  nutrition: { energy_kj: 1600, sugars_g: 1.0, sat_fat_g: 1.0, salt_g: 0.5, fibre_g: 8, protein_g: 10 },
  score: { overall: 82, grade: "A", verdict: "", positives: [], negatives: [],
           breakdown: { nutrients: [], india_flags: [], nova: { group: 1, label: "Minimally processed" } } },
});

describe("CompareScreen", () => {
  it("renders both products' names and grades", () => {
    render(<CompareScreen a={kurkure} b={makhana} onBack={() => {}} />);
    expect(screen.getByText("Kurkure")).toBeInTheDocument();
    expect(screen.getByText("Makhana")).toBeInTheDocument();
    expect(screen.getByText("D")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("marks the better side as winner per nutrient", () => {
    render(<CompareScreen a={kurkure} b={makhana} onBack={() => {}} />);
    // sat fat: makhana (b) is lower → winner
    expect(screen.getByTestId("cell-sat_fat_g-b")).toHaveAttribute("data-winner", "true");
    expect(screen.getByTestId("cell-sat_fat_g-a")).toHaveAttribute("data-winner", "false");
    // fibre: makhana (b) is higher → winner
    expect(screen.getByTestId("cell-fibre_g-b")).toHaveAttribute("data-winner", "true");
  });

  it("shows NOVA + flag chips for the processed product and Clean for the other", () => {
    render(<CompareScreen a={kurkure} b={makhana} onBack={() => {}} />);
    expect(screen.getByText(/NOVA 4/)).toBeInTheDocument();
    expect(screen.getByText("Palm oil")).toBeInTheDocument();
    expect(screen.getByText("Clean")).toBeInTheDocument();
  });

  it("renders a placeholder (no broken img) when a product has no image", () => {
    render(<CompareScreen a={kurkure} b={makhana} onBack={() => {}} />);
    expect(screen.queryByAltText("Makhana")).not.toBeInTheDocument();
    expect(screen.getByAltText("Kurkure")).toBeInTheDocument();
  });

  it("calls onBack when the back button is pressed", async () => {
    const onBack = vi.fn();
    render(<CompareScreen a={kurkure} b={makhana} onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
