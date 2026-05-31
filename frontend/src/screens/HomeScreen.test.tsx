import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomeScreen } from "./HomeScreen";
import type { Product, ScanResult } from "../api/types";
import type { HistoryEntry } from "../session/history";

const RESULT: ScanResult = {
  source: "photo", remaining: 2,
  product: { barcode: "x", name: "Chips", brand: "Lays", ingredients: ["potato"], source: "photo",
    nutrition: { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, fruit_veg_nuts_pct: 0 },
    score: { overall: 40, grade: "C", verdict: "Okay sometimes", positives: [], negatives: [], breakdown: { nutrients: [], india_flags: [] } } },
};

function entry(barcode: string, name: string): HistoryEntry {
  return { at: 1, product: { ...RESULT.product, barcode, name } as Product };
}

function setup(overrides = {}) {
  const props = {
    token: "tok",
    isGuest: true,
    history: [] as HistoryEntry[],
    onResult: vi.fn(),
    onOpenCamera: vi.fn(),
    onOpenProduct: vi.fn(),
    onSeeHistory: vi.fn(),
    onSignIn: vi.fn(),
    scanByBarcode: vi.fn().mockResolvedValue(RESULT),
    scanByPhoto: vi.fn().mockResolvedValue(RESULT),
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

  it("opens the camera only when 'Scan barcode' is tapped", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: /scan barcode/i }));
    expect(props.onOpenCamera).toHaveBeenCalledOnce();
  });

  it("uploads a label photo from the gallery and reports the result", async () => {
    const props = setup();
    const file = new File([new Uint8Array([1, 2, 3])], "label.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByTestId("home-upload"), file);
    expect(props.scanByPhoto).toHaveBeenCalledOnce();
    expect(props.onResult).toHaveBeenCalledWith(RESULT);
  });

  it("looks up a manually entered barcode", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: /enter barcode/i }));
    await userEvent.type(screen.getByPlaceholderText(/enter barcode number/i), "8901058000177");
    await userEvent.click(screen.getByRole("button", { name: /^go$/i }));
    expect(props.scanByBarcode).toHaveBeenCalledWith("8901058000177", "tok");
    expect(props.onResult).toHaveBeenCalledWith(RESULT);
  });

  it("shows the remaining-scans pill when provided", () => {
    setup({ remaining: 5 });
    expect(screen.getByText(/5 scans left today/i)).toBeInTheDocument();
  });

  it("at the limit, tapping Scan barcode shows the limit modal instead of opening the camera", async () => {
    const props = setup({ remaining: 0 });
    await userEvent.click(screen.getByRole("button", { name: /scan barcode/i }));
    expect(props.onOpenCamera).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/today's free scans/i)).toBeInTheDocument();
  });

  it("at the limit, a guest's modal offers sign-in", async () => {
    const props = setup({ remaining: 0, isGuest: true });
    await userEvent.click(screen.getByRole("button", { name: /upload label photo/i }));
    expect(props.scanByPhoto).not.toHaveBeenCalled();
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
});
