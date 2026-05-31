import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultScreen } from "./ResultScreen";
import type { Product } from "../api/types";

const product: Product = {
  barcode: "1", name: "Kurkure", brand: "PepsiCo", ingredients: ["corn meal", "palmolein"],
  nutrition: { energy_kj: 2326, sugars_g: 1.7, sat_fat_g: 15.2, salt_g: 1.7, fibre_g: 0, protein_g: 6.4, fruit_veg_nuts_pct: 0 },
  source: "photo",
  score: {
    overall: 21, grade: "D", verdict: "Best limited",
    positives: ["Protein (6.4g)"], negatives: ["High saturated fat", "Palm oil"],
    breakdown: {
      nutrients: [{ key: "sat_fat", label: "Saturated fat", value_g: 15.2, pct: 100, level: "high", high_is_bad: true }],
      india_flags: [{ label: "Palm oil", note: "Flagged for India market" }],
      nova: { group: 4, label: "Ultra-processed" },
    },
  },
};

describe("ResultScreen", () => {
  it("shows the Nutri-Score label, grade, score, verdict, and product", () => {
    render(<ResultScreen product={product} onScanAgain={() => {}} />);
    expect(screen.getByText(/nutri-score/i)).toBeInTheDocument();
    expect(screen.getByText("D")).toBeInTheDocument();
    expect(screen.getByText("21 / 100")).toBeInTheDocument();
    expect(screen.getByText("Best limited")).toBeInTheDocument();
    expect(screen.getByText("Kurkure")).toBeInTheDocument();
  });

  it("shows the NOVA badge with its group and label", () => {
    render(<ResultScreen product={product} onScanAgain={() => {}} />);
    expect(screen.getByText("NOVA 4")).toBeInTheDocument();
    expect(screen.getByText("Ultra-processed")).toBeInTheDocument();
  });

  it("expands a cited explanation when a warning's 'Why?' is tapped", async () => {
    render(<ResultScreen product={product} onScanAgain={() => {}} />);
    // not visible until tapped
    expect(screen.queryByText(/raises ldl cholesterol/i)).not.toBeInTheDocument();
    const palmChip = screen.getByText("Palm oil").closest("button")!;
    await userEvent.click(palmChip);
    expect(screen.getByText(/raises ldl cholesterol/i)).toBeInTheDocument();
    expect(screen.getByText(/Source:/i)).toBeInTheDocument();
  });

  it("toggles the full breakdown", async () => {
    render(<ResultScreen product={product} onScanAgain={() => {}} />);
    expect(screen.queryByText("Per 100g")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /breakdown/i }));
    expect(screen.getByText("Per 100g")).toBeInTheDocument();
  });

  it("calls onScanAgain when 'Scan another' is clicked", async () => {
    const onScanAgain = vi.fn();
    render(<ResultScreen product={product} onScanAgain={onScanAgain} />);
    await userEvent.click(screen.getByRole("button", { name: /scan another/i }));
    expect(onScanAgain).toHaveBeenCalledOnce();
  });

  it("renders without a NOVA badge when nova is absent", () => {
    const noNova: Product = {
      ...product,
      score: { ...product.score, breakdown: { ...product.score.breakdown, nova: undefined } },
    };
    render(<ResultScreen product={noNova} onScanAgain={() => {}} />);
    expect(screen.queryByText(/^NOVA/)).not.toBeInTheDocument();
  });
});
