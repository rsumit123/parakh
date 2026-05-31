import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScanScreen } from "./ScanScreen";
import type { ScanResult } from "../api/types";

const RESULT: ScanResult = {
  source: "off", remaining: 2,
  product: { barcode: "1", name: "Chana", brand: "Tata", ingredients: [], source: "off",
    nutrition: { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, fruit_veg_nuts_pct: 0 },
    score: { overall: 84, grade: "A", verdict: "Good choice", positives: [], negatives: [], breakdown: { nutrients: [], india_flags: [] } } },
};

function setup(overrides = {}) {
  const props = {
    token: "tok",
    isGuest: true,
    onResult: vi.fn(),
    onBack: vi.fn(),
    onSignIn: vi.fn(),
    scanByBarcode: vi.fn().mockResolvedValue(RESULT),
    scanByPhoto: vi.fn().mockResolvedValue(RESULT),
    ...overrides,
  };
  render(<ScanScreen {...props} />);
  return props;
}

describe("ScanScreen", () => {
  it("renders the camera viewfinder and a back button", () => {
    setup();
    expect(screen.getByLabelText(/back/i)).toBeInTheDocument();
    expect(screen.getByText(/line up the barcode/i)).toBeInTheDocument();
  });

  it("calls onBack when the back button is tapped", async () => {
    const props = setup();
    await userEvent.click(screen.getByLabelText(/back/i));
    expect(props.onBack).toHaveBeenCalledOnce();
  });

  it("uploads a label photo from the gallery (no capture attribute)", async () => {
    const props = setup();
    const upload = screen.getByTestId("scan-upload");
    expect(upload).not.toHaveAttribute("capture");
    const file = new File([new Uint8Array([1, 2, 3])], "label.jpg", { type: "image/jpeg" });
    await userEvent.upload(upload, file);
    expect(props.scanByPhoto).toHaveBeenCalledOnce();
    expect(props.onResult).toHaveBeenCalledWith(RESULT);
  });

  it("offers a camera capture input (with capture attribute)", () => {
    setup();
    expect(screen.getByTestId("scan-capture")).toHaveAttribute("capture", "environment");
  });

  it("shows the remaining pill when provided", () => {
    setup({ remaining: 3 });
    expect(screen.getByText(/3 left/i)).toBeInTheDocument();
  });

  it("prompts for a label photo (not silent) when an uploaded barcode is unknown", async () => {
    setup({ scanByPhoto: vi.fn().mockRejectedValue(new NeedsPhotoError()) });
    // a barcode-less photo whose key isn't known triggers NeedsPhoto from the backend
    // — but more importantly, simulate the barcode path returning needs-photo:
    // upload a photo that the (fake) backend says needs a photo -> we show the notice
    const file = new File([new Uint8Array([1])], "l.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByTestId("scan-upload"), file);
    expect(await screen.findByText(/we don't know this product yet/i)).toBeInTheDocument();
  });
});
