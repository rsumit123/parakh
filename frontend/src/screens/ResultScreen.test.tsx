import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultScreen } from "./ResultScreen";
import type { Product } from "../api/types";

const product: Product = {
  barcode: "1", name: "Roasted Chana", brand: "Tata", ingredients: ["chana"],
  nutrition: { energy_kj: 300, sugars_g: 2, sat_fat_g: 0.5, salt_g: 0.1, fibre_g: 5, protein_g: 9, fruit_veg_nuts_pct: 0 },
  source: "off",
  score: {
    overall: 84, grade: "A", verdict: "Good choice",
    positives: ["High protein"], negatives: [],
    breakdown: { nutrients: [{ key: "sugars", label: "Sugar", value_g: 2, pct: 18, level: "low", high_is_bad: true }], india_flags: [] },
  },
};

describe("ResultScreen", () => {
  it("shows verdict, score, product name, and reasons", () => {
    render(<ResultScreen product={product} onScanAgain={() => {}} />);
    expect(screen.getByText("Good choice")).toBeInTheDocument();
    expect(screen.getByText("84 / 100")).toBeInTheDocument();
    expect(screen.getByText("Roasted Chana")).toBeInTheDocument();
    expect(screen.getByText("High protein")).toBeInTheDocument();
  });

  it("toggles the breakdown open", async () => {
    render(<ResultScreen product={product} onScanAgain={() => {}} />);
    expect(screen.queryByText("Per 100g")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /breakdown/i }));
    expect(screen.getByText("Per 100g")).toBeInTheDocument();
  });

  it("calls onScanAgain when the scan-again button is clicked", async () => {
    const onScanAgain = vi.fn();
    render(<ResultScreen product={product} onScanAgain={onScanAgain} />);
    await userEvent.click(screen.getByRole("button", { name: /scan another/i }));
    expect(onScanAgain).toHaveBeenCalledOnce();
  });
});
