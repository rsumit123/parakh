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

  it("after guest login, shows the scan screen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "g" }) }));
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /guest/i }));
    expect(await screen.findByPlaceholderText(/enter barcode/i)).toBeInTheDocument();
  });
});
