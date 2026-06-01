import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadToken, saveToken, clearToken, guestLogin, googleLogin } from "./session";

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

describe("googleLogin", () => {
  it("posts the id_token and stores the returned token and email", async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ token: "user:7.sig", email: "a@b.com", name: "Ada", avatar_url: null }),
    });
    vi.stubGlobal("fetch", spy);
    const res = await googleLogin("fake-credential");
    expect(res.token).toBe("user:7.sig");
    expect(res.email).toBe("a@b.com");
    expect(loadToken()).toBe("user:7.sig");
    const [path, init] = spy.mock.calls[0];
    expect(path).toContain("/auth/google");
    expect(JSON.parse(init.body).id_token).toBe("fake-credential");
  });
});
