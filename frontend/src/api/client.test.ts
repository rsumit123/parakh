import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJson, ApiError, apiUrl } from "./client";

afterEach(() => vi.restoreAllMocks());

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

describe("apiUrl", () => {
  it("prefixes with VITE_API_BASE_URL when set, else returns path", () => {
    expect(apiUrl("/scan/barcode", "")).toBe("/scan/barcode");
    expect(apiUrl("/scan/barcode", "https://api.test")).toBe("https://api.test/scan/barcode");
  });
});

describe("fetchJson", () => {
  it("returns parsed JSON on success", async () => {
    mockFetch(200, { token: "t" });
    const out = await fetchJson<{ token: string }>("/auth/guest", { method: "POST" });
    expect(out.token).toBe("t");
  });

  it("throws ApiError carrying status and detail on failure", async () => {
    mockFetch(404, { detail: { error: "product not found", needs_photo: true } });
    await expect(fetchJson("/scan/barcode", { method: "POST" })).rejects.toMatchObject({
      status: 404,
    });
    try {
      mockFetch(404, { detail: { error: "x", needs_photo: true } });
      await fetchJson("/scan/barcode", { method: "POST" });
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).detail).toMatchObject({ needs_photo: true });
    }
  });

  it("attaches a bearer token when provided", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", spy);
    await fetchJson("/scan/barcode", { method: "POST", token: "abc" });
    const headers = spy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer abc");
  });
});
