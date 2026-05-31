import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("App", () => {
  it("shows the auth screen when there is no session", () => {
    render(<App />);
    expect(screen.getByText(/in your food/i)).toBeInTheDocument();
  });

  it("after guest login, lands on the Home screen (camera off, no video element)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "g" }) }));
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /guest/i }));
    expect(await screen.findByRole("button", { name: /scan barcode/i })).toBeInTheDocument();
    // critical: no camera auto-start on the landing page
    expect(document.querySelector("video")).toBeNull();
  });

  it("opens the camera scan screen only after tapping Scan barcode", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "g" }) }));
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /guest/i }));
    await userEvent.click(await screen.findByRole("button", { name: /scan barcode/i }));
    expect(await screen.findByText(/line up the barcode/i)).toBeInTheDocument();
  });
});
