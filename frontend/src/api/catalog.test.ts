import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchCategories, fetchCatalogProducts } from "./catalog";

afterEach(() => vi.restoreAllMocks());

function stub(json: unknown) {
  const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => json });
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("catalog api", () => {
  it("fetchCategories sends token and returns categories", async () => {
    const spy = stub({ categories: [{ category: "drinks", count: 90 }] });
    const out = await fetchCategories("tok");
    expect(out.categories[0].category).toBe("drinks");
    expect(spy.mock.calls[0][0]).toContain("/catalog/categories");
    expect(spy.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });
  it("fetchCatalogProducts builds query from params", async () => {
    const spy = stub({ items: [], total: 0 });
    await fetchCatalogProducts("tok", { category: "drinks", grade: "A", limit: 200 });
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("/catalog/products?");
    expect(url).toContain("category=drinks");
    expect(url).toContain("grade=A");
    expect(url).toContain("limit=200");
  });
  it("fetchCatalogProducts omits blank params and encodes q", async () => {
    const spy = stub({ items: [], total: 0 });
    await fetchCatalogProducts("tok", { q: "amul oats" });
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("q=amul+oats");
    expect(url).not.toContain("category=");
    expect(url).not.toContain("grade=");
  });
});
