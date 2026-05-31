import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionProvider, useSession } from "./SessionContext";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

function Probe() {
  const { token, guest, signOut } = useSession();
  return (
    <div>
      <span data-testid="token">{token ?? "none"}</span>
      <button onClick={() => guest()}>guest</button>
      <button onClick={() => signOut()}>out</button>
    </div>
  );
}

describe("SessionContext", () => {
  it("starts with no token, then guest() sets one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "g" }) }));
    render(<SessionProvider><Probe /></SessionProvider>);
    expect(screen.getByTestId("token").textContent).toBe("none");
    await userEvent.click(screen.getByText("guest"));
    expect(screen.getByTestId("token").textContent).toBe("g");
  });

  it("hydrates an existing token from storage", () => {
    localStorage.setItem("parakh.token", "stored");
    render(<SessionProvider><Probe /></SessionProvider>);
    expect(screen.getByTestId("token").textContent).toBe("stored");
  });

  it("signOut clears the token", async () => {
    localStorage.setItem("parakh.token", "stored");
    render(<SessionProvider><Probe /></SessionProvider>);
    await userEvent.click(screen.getByText("out"));
    expect(screen.getByTestId("token").textContent).toBe("none");
  });
});
