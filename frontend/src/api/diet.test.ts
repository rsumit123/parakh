import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { addLog, putProfile, deleteLog, estimateMeal } from "./diet";

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ entries: [], targets: {}, totals: {}, status: {}, headline: "", date: "", ok: true, profile: {}, effective_targets: {}, entry: {} }), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
}

describe("diet client HTTP methods", () => {
  let f: ReturnType<typeof mockFetch>;
  beforeEach(() => { f = mockFetch(); });
  afterEach(() => { f.mockRestore(); });

  it("addLog uses POST with a JSON body", async () => {
    await addLog("tok", { kind: "packaged", barcode: "b1", name: "X", quantity_g: 100 });
    const [, init] = f.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeTruthy();
  });

  it("putProfile uses PUT", async () => {
    await putProfile("tok", { target_overrides: { protein_g: 90 } });
    expect(f.mock.calls[0][1]?.method).toBe("PUT");
  });

  it("deleteLog uses DELETE", async () => {
    await deleteLog("tok", 5);
    expect(f.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it("estimateMeal uses POST with FormData", async () => {
    await estimateMeal("tok", new File(["x"], "m.jpg", { type: "image/jpeg" }));
    const [, init] = f.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.body instanceof FormData).toBe(true);
  });
});
