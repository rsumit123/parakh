import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadToken, saveToken, clearToken, guestLogin, emailLogin } from "./session";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("token storage", () => {
  it("save/load/clear round-trip", () => {
    expect(loadToken()).toBeNull();
    saveToken("tok");
    expect(loadToken()).toBe("tok");
    clearToken();
    expect(loadToken()).toBeNull();
  });
});

describe("guestLogin", () => {
  it("posts device id and stores the returned token", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "guest-tok" }) });
    vi.stubGlobal("fetch", spy);
    const token = await guestLogin();
    expect(token).toBe("guest-tok");
    expect(loadToken()).toBe("guest-tok");
    const [path, init] = spy.mock.calls[0];
    expect(path).toContain("/auth/guest");
    expect(JSON.parse(init.body).device_id).toMatch(/.+/);
  });
});

describe("emailLogin", () => {
  it("posts email and stores the returned token", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "email-tok" }) });
    vi.stubGlobal("fetch", spy);
    const token = await emailLogin("a@b.com");
    expect(token).toBe("email-tok");
    expect(loadToken()).toBe("email-tok");
    expect(JSON.parse(spy.mock.calls[0][1].body).email).toBe("a@b.com");
  });
});
