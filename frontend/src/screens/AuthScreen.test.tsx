import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthScreen } from "./AuthScreen";

afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as unknown as { google?: unknown }).google;
});

describe("AuthScreen", () => {
  it("renders the headline and tagline", () => {
    render(<AuthScreen onGuest={vi.fn()} onGoogleLogin={vi.fn()} />);
    expect(screen.getByText(/really in your food/i)).toBeInTheDocument();
    expect(screen.getByText(/health score in seconds/i)).toBeInTheDocument();
  });

  it("continues as guest", async () => {
    const onGuest = vi.fn().mockResolvedValue(undefined);
    render(<AuthScreen onGuest={onGuest} onGoogleLogin={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /guest/i }));
    expect(onGuest).toHaveBeenCalledOnce();
  });

  it("shows an error when guest sign-in fails", async () => {
    const onGuest = vi.fn().mockRejectedValue(new Error("boom"));
    render(<AuthScreen onGuest={onGuest} onGoogleLogin={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /guest/i }));
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("forwards the Google credential to onGoogleLogin", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");
    let captured: ((r: { credential?: string }) => void) | null = null;
    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: (cfg: { callback: (r: { credential?: string }) => void }) => {
            captured = cfg.callback;
          },
          renderButton: () => {},
        },
      },
    };
    const onGoogleLogin = vi.fn().mockResolvedValue(undefined);
    render(<AuthScreen onGuest={vi.fn()} onGoogleLogin={onGoogleLogin} />);
    await waitFor(() => expect(captured).toBeTruthy());
    captured!({ credential: "fake-jwt" });
    expect(onGoogleLogin).toHaveBeenCalledWith("fake-jwt");
  });
});
