import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { saveToken } from "./session/session";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("App", () => {
  it("shows the auth screen when there is no session", () => {
    render(<App />);
    expect(screen.getByText(/in your food/i)).toBeInTheDocument();
  });

  it("after guest login, lands on the Home screen (camera off, no video element)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "guest:g" }) }));
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /guest/i }));
    expect(await screen.findByRole("button", { name: /scan a product/i })).toBeInTheDocument();
    // critical: no camera auto-start on the landing page
    expect(document.querySelector("video")).toBeNull();
  });

  it("opens the camera scan screen only after tapping Scan barcode", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "guest:g" }) }));
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /guest/i }));
    await userEvent.click(await screen.findByRole("button", { name: /scan a product/i }));
    expect(await screen.findByText(/line up the barcode/i)).toBeInTheDocument();
  });

  it("a signed-in user opens on Today, with Today as the first tab", async () => {
    saveToken("user-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
    render(<App />);
    expect(screen.getByRole("button", { name: /Today/ })).toHaveAttribute("aria-current", "page");
    const tabs = screen.getAllByRole("button").filter((b) => /^(📊|📷|🔍|🕘)/.test(b.textContent ?? ""));
    expect(tabs.map((b) => b.textContent?.slice(2))).toEqual(["Today", "Scan", "Explore", "History"]);
  });
});
