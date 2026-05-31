import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryScreen } from "./HistoryScreen";
import type { HistoryEntry } from "../session/history";
import type { Product } from "../api/types";

function product(barcode: string, name: string, grade = "D"): Product {
  return {
    barcode, name, brand: "PepsiCo", ingredients: [], source: "photo",
    nutrition: { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, fruit_veg_nuts_pct: 0 },
    score: { overall: 21, grade: grade as Product["score"]["grade"], verdict: "Best limited", positives: [], negatives: [], breakdown: { nutrients: [], india_flags: [] } },
  };
}

describe("HistoryScreen", () => {
  it("shows an empty state when there are no scans", () => {
    render(<HistoryScreen entries={[]} onBack={vi.fn()} onOpen={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText(/no scans yet/i)).toBeInTheDocument();
  });

  it("lists scans with grade and name", () => {
    const entries: HistoryEntry[] = [{ at: 1, product: product("1", "Kurkure") }];
    render(<HistoryScreen entries={entries} onBack={vi.fn()} onOpen={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText("Kurkure")).toBeInTheDocument();
    expect(screen.getByText("D")).toBeInTheDocument();
  });

  it("opens a product when its row is tapped", async () => {
    const onOpen = vi.fn();
    const p = product("1", "Kurkure");
    render(<HistoryScreen entries={[{ at: 1, product: p }]} onBack={vi.fn()} onOpen={onOpen} onClear={vi.fn()} />);
    await userEvent.click(screen.getByText("Kurkure"));
    expect(onOpen).toHaveBeenCalledWith(p);
  });

  it("clears history", async () => {
    const onClear = vi.fn();
    render(<HistoryScreen entries={[{ at: 1, product: product("1", "Kurkure") }]} onBack={vi.fn()} onOpen={vi.fn()} onClear={onClear} />);
    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
