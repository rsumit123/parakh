import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomeScreen } from "./HomeScreen";
import type { Product } from "../api/types";
import type { HistoryEntry } from "../session/history";

const PRODUCT: Product = {
  barcode: "x", name: "Chips", brand: "Lays", ingredients: ["potato"], source: "photo",
  nutrition: { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, fruit_veg_nuts_pct: 0 },
  score: { overall: 40, grade: "C", verdict: "Okay sometimes", positives: [], negatives: [], breakdown: { nutrients: [], india_flags: [] } },
};

function entry(barcode: string, name: string): HistoryEntry {
  return { at: 1, product: { ...PRODUCT, barcode, name } };
}

function setup(overrides = {}) {
  const props = {
    isGuest: true,
    history: [] as HistoryEntry[],
    onOpenCamera: vi.fn(),
    onOpenProduct: vi.fn(),
    onSeeHistory: vi.fn(),
    onSignIn: vi.fn(),
    onSnapMeal: vi.fn(),
    ...overrides,
  };
  render(<HomeScreen {...props} />);
  return props;
}

describe("HomeScreen", () => {
  it("does NOT auto-start a camera (no video element on the landing page)", () => {
    setup();
    expect(document.querySelector("video")).toBeNull();
  });

  it("has a single Scan button and no upload/manual-barcode controls", () => {
    setup();
    expect(screen.getByRole("button", { name: /scan a product/i })).toBeInTheDocument();
    expect(screen.queryByTestId("home-upload")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enter barcode/i })).not.toBeInTheDocument();
  });

  it("opens the camera when the Scan button is tapped", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: /scan a product/i }));
    expect(props.onOpenCamera).toHaveBeenCalledOnce();
  });

  it("shows the remaining-scans pill when provided", () => {
    setup({ remaining: 5 });
    expect(screen.getByText(/5 scans left today/i)).toBeInTheDocument();
  });

  it("at the limit, tapping Scan shows the limit modal instead of opening the camera", async () => {
    const props = setup({ remaining: 0 });
    await userEvent.click(screen.getByRole("button", { name: /scan a product/i }));
    expect(props.onOpenCamera).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("at the limit, a guest's modal offers sign-in", async () => {
    const props = setup({ remaining: 0, isGuest: true });
    await userEvent.click(screen.getByRole("button", { name: /scan a product/i }));
    await userEvent.click(screen.getByRole("button", { name: /sign in for more/i }));
    expect(props.onSignIn).toHaveBeenCalledOnce();
  });

  it("renders an empty recent-scans state when there's no history", () => {
    setup({ history: [] });
    expect(screen.getByText(/scanned products will appear here/i)).toBeInTheDocument();
  });

  it("lists recent scans and opens one when tapped", async () => {
    const props = setup({ history: [entry("1", "Kurkure"), entry("2", "Lays")] });
    expect(screen.getByText("Recent scans")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Kurkure"));
    expect(props.onOpenProduct).toHaveBeenCalledOnce();
  });

  it("snap-a-meal button calls onSnapMeal", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: /snap a meal/i }));
    expect(props.onSnapMeal).toHaveBeenCalledOnce();
  });
});
