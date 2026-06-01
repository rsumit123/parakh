import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultScreen } from "./ResultScreen";
import { shareResult } from "../scan/shareCard";
import type { Product } from "../api/types";

// Share uses canvas + Web Share API which jsdom lacks; mock the share module so the
// test verifies the button wiring, not the canvas rendering (covered conceptually).
vi.mock("../scan/shareCard", () => ({
  shareResult: vi.fn().mockResolvedValue("shared"),
}));

const product: Product = {
  barcode: "1", name: "Kurkure", brand: "PepsiCo", ingredients: ["corn meal", "palmolein"],
  nutrition: { energy_kj: 2326, sugars_g: 1.7, sat_fat_g: 15.2, salt_g: 1.7, fibre_g: 0, protein_g: 6.4, fruit_veg_nuts_pct: 0 },
  source: "photo",
  score: {
    overall: 21, grade: "D", verdict: "Best limited",
    positives: ["Protein (6.4g)"], negatives: ["High saturated fat", "Palm oil"],
    breakdown: {
      nutrients: [
        { key: "sat_fat", label: "Saturated fat", value_g: 15.2, pct: 100, level: "high", high_is_bad: true },
        { key: "salt", label: "Salt", value_g: 1.7, pct: 57, level: "ok", high_is_bad: true },
      ],
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

  it("shows the product image when image_url is present", () => {
    render(
      <ResultScreen
        product={{ ...product, image_url: "https://img/x.jpg" }}
        onScanAgain={() => {}}
      />,
    );
    const img = screen.getByAltText(/kurkure/i) as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("https://img/x.jpg");
  });

  it("renders no product image when image_url is absent", () => {
    render(<ResultScreen product={product} onScanAgain={() => {}} />);
    expect(screen.queryByAltText(/kurkure/i)).not.toBeInTheDocument();
  });

  it("shows the NOVA pill in the hero", () => {
    render(<ResultScreen product={product} onScanAgain={() => {}} />);
    expect(screen.getByText(/NOVA 4 · Ultra-processed/i)).toBeInTheDocument();
  });

  it("shows the always-visible at-a-glance nutrient strip (no tap needed)", () => {
    render(<ResultScreen product={product} onScanAgain={() => {}} />);
    expect(screen.getByText(/at a glance/i)).toBeInTheDocument();
    // nutrient labels appear without opening the breakdown
    expect(screen.getAllByText("Saturated fat").length).toBeGreaterThan(0);
  });

  it("shows an actionable tip on each warning without tapping", () => {
    render(<ResultScreen product={product} onScanAgain={() => {}} />);
    // sat-fat tip text
    expect(screen.getByText(/balance it with a meal rich in fibre/i)).toBeInTheDocument();
  });

  it("expands a cited explanation when a warning's 'Why?' is tapped", async () => {
    render(<ResultScreen product={product} onScanAgain={() => {}} />);
    expect(screen.queryByText(/raises ldl/i)).not.toBeInTheDocument();
    const whyButtons = screen.getAllByRole("button", { name: /why\?/i });
    await userEvent.click(whyButtons[0]);
    expect(screen.getByText(/Source:/i)).toBeInTheDocument();
  });

  it("toggles ingredients & full numbers", async () => {
    render(<ResultScreen product={product} onScanAgain={() => {}} />);
    expect(screen.queryByText("Per 100g")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /ingredients & full numbers/i }));
    expect(screen.getByText("Per 100g")).toBeInTheDocument();
    expect(screen.getByText(/corn meal, palmolein/i)).toBeInTheDocument();
  });

  it("calls onScanAgain when 'Scan another' is clicked", async () => {
    const onScanAgain = vi.fn();
    render(<ResultScreen product={product} onScanAgain={onScanAgain} />);
    await userEvent.click(screen.getByRole("button", { name: /scan another/i }));
    expect(onScanAgain).toHaveBeenCalledOnce();
  });

  it("invokes the share flow with the product when Share is tapped", async () => {
    render(<ResultScreen product={product} onScanAgain={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /share/i }));
    expect(shareResult).toHaveBeenCalledWith(product);
  });

  it("renders a clean state and no NOVA pill when product is flag-free", () => {
    const clean: Product = {
      ...product, name: "Roasted Chana",
      score: {
        overall: 84, grade: "A", verdict: "Good choice", positives: [], negatives: [],
        breakdown: { nutrients: [{ key: "protein", label: "Protein", value_g: 9, pct: 75, level: "high", high_is_bad: false }], india_flags: [], nova: { group: 1, label: "Minimally processed" } },
      },
    };
    render(<ResultScreen product={clean} onScanAgain={() => {}} />);
    expect(screen.getByText(/nothing to flag here/i)).toBeInTheDocument();
    expect(screen.queryByText(/^NOVA 1/)).not.toBeInTheDocument();
  });

  it("lists healthier alternatives and opens one when tapped", async () => {
    const alt: Product = {
      ...product, barcode: "alt1", name: "Baked Oat Snack", brand: "Healthy Co",
      score: { ...product.score, overall: 82, grade: "A", verdict: "Good choice" },
    };
    const onOpenProduct = vi.fn();
    render(
      <ResultScreen product={product} alternatives={[alt]} onScanAgain={() => {}} onOpenProduct={onOpenProduct} />,
    );
    expect(screen.getByText(/healthier options/i)).toBeInTheDocument();
    await userEvent.click(screen.getByText("Baked Oat Snack"));
    expect(onOpenProduct).toHaveBeenCalledWith(alt);
  });

  it("shows no 'Healthier options' section when there are none", () => {
    render(<ResultScreen product={product} alternatives={[]} onScanAgain={() => {}} />);
    expect(screen.queryByText(/healthier options/i)).not.toBeInTheDocument();
  });
});
