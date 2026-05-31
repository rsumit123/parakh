import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScan } from "./useScan";
import { NeedsPhotoError, RateLimitError, AuthExpiredError } from "./scanApi";
import type { ScanResult } from "../api/types";

const RESULT = { source: "off", remaining: 2, product: {} } as unknown as ScanResult;

function setup(over: Partial<Parameters<typeof useScan>[0]> = {}) {
  const onResult = vi.fn();
  const onAuthError = vi.fn();
  const onNeedsPhoto = vi.fn();
  const opts = {
    token: "tok",
    onResult, onAuthError, onNeedsPhoto,
    scanByBarcode: vi.fn().mockResolvedValue(RESULT),
    scanByPhoto: vi.fn().mockResolvedValue(RESULT),
    ...over,
  };
  const hook = renderHook(() => useScan(opts));
  return { hook, ...opts };
}

describe("useScan", () => {
  it("runs a barcode scan and reports the result", async () => {
    const { hook, onResult, scanByBarcode } = setup();
    await act(async () => { await hook.result.current.runBarcode("111"); });
    expect(scanByBarcode).toHaveBeenCalledWith("111", "tok");
    expect(onResult).toHaveBeenCalledWith(RESULT);
    expect(hook.result.current.busy).toBe(false);
  });

  it("routes NeedsPhotoError to onNeedsPhoto (not a hard error)", async () => {
    const { hook, onNeedsPhoto } = setup({
      scanByBarcode: vi.fn().mockRejectedValue(new NeedsPhotoError()),
    });
    await act(async () => { await hook.result.current.runBarcode("999"); });
    expect(onNeedsPhoto).toHaveBeenCalledOnce();
    expect(hook.result.current.error).toBeNull();
  });

  it("flags the rate limit (for a modal) instead of a red error string", async () => {
    const { hook } = setup({ scanByBarcode: vi.fn().mockRejectedValue(new RateLimitError()) });
    await act(async () => { await hook.result.current.runBarcode("1"); });
    expect(hook.result.current.limitReached).toBe(true);
    expect(hook.result.current.error).toBeNull();
  });

  it("calls onAuthError on 401", async () => {
    const { hook, onAuthError, onResult } = setup({
      scanByBarcode: vi.fn().mockRejectedValue(new AuthExpiredError()),
    });
    await act(async () => { await hook.result.current.runBarcode("1"); });
    expect(onAuthError).toHaveBeenCalledOnce();
    expect(onResult).not.toHaveBeenCalled();
  });

  it("uploads a photo, minting a key when no barcode is given", async () => {
    const { hook, scanByPhoto } = setup();
    const file = new File([new Uint8Array([1])], "l.jpg", { type: "image/jpeg" });
    await act(async () => { await hook.result.current.runPhoto(file); });
    const sentKey = (scanByPhoto as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sentKey).toBeTruthy();
    expect(sentKey).not.toBe("unknown");
  });

  it("uses the given barcode as the photo key when provided", async () => {
    const { hook, scanByPhoto } = setup();
    const file = new File([new Uint8Array([1])], "l.jpg", { type: "image/jpeg" });
    await act(async () => { await hook.result.current.runPhoto(file, "8901"); });
    expect(scanByPhoto).toHaveBeenCalledWith("8901", expect.any(File), "tok");
  });
});
