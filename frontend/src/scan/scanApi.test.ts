import { describe, it, expect, vi, afterEach } from "vitest";
import { scanBarcode, scanPhoto, NeedsPhotoError, RateLimitError, AuthExpiredError } from "./scanApi";
import { ApiError } from "../api/client";

afterEach(() => vi.restoreAllMocks());

const RESULT = {
  source: "off", remaining: 2,
  product: { barcode: "1", name: "X", brand: "Y", ingredients: [], nutrition: {}, source: "off",
    score: { overall: 80, grade: "A", verdict: "Good choice", positives: [], negatives: [], breakdown: { nutrients: [], india_flags: [] } } },
};

describe("scanBarcode", () => {
  it("returns a ScanResult on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => RESULT }));
    const out = await scanBarcode("1", "tok");
    expect(out.product.score.grade).toBe("A");
    expect(out.remaining).toBe(2);
  });

  it("maps 404 to NeedsPhotoError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ detail: { needs_photo: true } }) }));
    await expect(scanBarcode("1", "tok")).rejects.toBeInstanceOf(NeedsPhotoError);
  });

  it("maps 429 to RateLimitError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ detail: { error: "limit" } }) }));
    await expect(scanBarcode("1", "tok")).rejects.toBeInstanceOf(RateLimitError);
  });

  it("maps 401 to AuthExpiredError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ detail: "bad token" }) }));
    await expect(scanBarcode("1", "tok")).rejects.toBeInstanceOf(AuthExpiredError);
  });

  it("rethrows other ApiErrors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ detail: "boom" }) }));
    await expect(scanBarcode("1", "tok")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("scanPhoto", () => {
  it("sends multipart and returns a ScanResult", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => RESULT });
    vi.stubGlobal("fetch", spy);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const out = await scanPhoto("1", blob, "tok");
    expect(out.product.name).toBe("X");
    const init = spy.mock.calls[0][1];
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("barcode")).toBe("1");
  });
});
