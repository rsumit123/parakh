import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScanScreen } from "./ScanScreen";
import { NeedsPhotoError, RateLimitError, AuthExpiredError } from "../scan/scanApi";
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
    onResult: vi.fn(),
    scanByBarcode: vi.fn().mockResolvedValue(RESULT),
    scanByPhoto: vi.fn().mockResolvedValue(RESULT),
    ...overrides,
  };
  render(<ScanScreen {...props} />);
  return props;
}

describe("ScanScreen", () => {
  it("scans a manually entered barcode and reports the result", async () => {
    const props = setup();
    await userEvent.type(screen.getByPlaceholderText(/enter barcode/i), "8901058000177");
    await userEvent.click(screen.getByRole("button", { name: /^look up$/i }));
    expect(props.scanByBarcode).toHaveBeenCalledWith("8901058000177", "tok");
    expect(props.onResult).toHaveBeenCalledWith(RESULT);
  });

  it("prompts for a photo when the barcode is unknown", async () => {
    const props = setup({ scanByBarcode: vi.fn().mockRejectedValue(new NeedsPhotoError()) });
    await userEvent.type(screen.getByPlaceholderText(/enter barcode/i), "999");
    await userEvent.click(screen.getByRole("button", { name: /^look up$/i }));
    expect(await screen.findByText(/take a photo of the label/i)).toBeInTheDocument();
    expect(props.onResult).not.toHaveBeenCalled();
  });

  it("uploads a label photo and reports the result", async () => {
    const props = setup({ scanByBarcode: vi.fn().mockRejectedValue(new NeedsPhotoError()) });
    await userEvent.type(screen.getByPlaceholderText(/enter barcode/i), "999");
    await userEvent.click(screen.getByRole("button", { name: /^look up$/i }));
    const file = new File([new Uint8Array([1, 2, 3])], "label.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByTestId("photo-input-needs-photo"), file);
    expect(props.scanByPhoto).toHaveBeenCalled();
    expect(props.onResult).toHaveBeenCalledWith(RESULT);
  });

  it("shows a limit message on rate limit", async () => {
    setup({ scanByBarcode: vi.fn().mockRejectedValue(new RateLimitError()) });
    await userEvent.type(screen.getByPlaceholderText(/enter barcode/i), "1");
    await userEvent.click(screen.getByRole("button", { name: /^look up$/i }));
    expect(await screen.findByText(/daily scan limit/i)).toBeInTheDocument();
  });

  it("calls onAuthError when the token is rejected (401)", async () => {
    const onAuthError = vi.fn();
    const props = setup({
      onAuthError,
      scanByBarcode: vi.fn().mockRejectedValue(new AuthExpiredError()),
    });
    await userEvent.type(screen.getByPlaceholderText(/enter barcode/i), "1");
    await userEvent.click(screen.getByRole("button", { name: /^look up$/i }));
    expect(onAuthError).toHaveBeenCalledOnce();
    expect(props.onResult).not.toHaveBeenCalled();
  });

  it("shows the remaining-scans pill when provided", () => {
    setup({ remaining: 2 });
    expect(screen.getByText(/2 scans left today/i)).toBeInTheDocument();
  });

  it("uploads a label photo from the gallery without needing a barcode", async () => {
    const props = setup();
    const file = new File([new Uint8Array([1, 2, 3])], "label.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByTestId("photo-upload-bypass"), file);
    expect(props.scanByPhoto).toHaveBeenCalledOnce();
    // no barcode entered -> a non-empty synthetic key is sent (never the literal "unknown")
    const sentBarcode = props.scanByPhoto.mock.calls[0][0];
    expect(sentBarcode).toBeTruthy();
    expect(sentBarcode).not.toBe("unknown");
    expect(props.onResult).toHaveBeenCalledWith(RESULT);
  });

  it("offers a gallery upload (no forced camera) in the needs-photo state", async () => {
    setup({ scanByBarcode: vi.fn().mockRejectedValue(new NeedsPhotoError()) });
    await userEvent.type(screen.getByPlaceholderText(/enter barcode/i), "999");
    await userEvent.click(screen.getByRole("button", { name: /^look up$/i }));
    const upload = await screen.findByTestId("photo-upload-needs-photo");
    // gallery picker = a file input WITHOUT the capture attribute
    expect(upload).not.toHaveAttribute("capture");
  });

  it("uses the entered barcode as the key when uploading a label photo", async () => {
    const props = setup();
    await userEvent.type(screen.getByPlaceholderText(/enter barcode/i), "8901058000177");
    const file = new File([new Uint8Array([1, 2, 3])], "label.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByTestId("photo-upload-bypass"), file);
    expect(props.scanByPhoto).toHaveBeenCalledWith("8901058000177", expect.any(File), "tok");
  });
});
