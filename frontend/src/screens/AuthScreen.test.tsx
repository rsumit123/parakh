import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthScreen } from "./AuthScreen";

describe("AuthScreen", () => {
  it("continues as guest", async () => {
    const onGuest = vi.fn().mockResolvedValue(undefined);
    render(<AuthScreen onGuest={onGuest} onEmailLogin={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /guest/i }));
    expect(onGuest).toHaveBeenCalledOnce();
  });

  it("submits a valid email", async () => {
    const onEmailLogin = vi.fn().mockResolvedValue(undefined);
    render(<AuthScreen onGuest={vi.fn()} onEmailLogin={onEmailLogin} />);
    await userEvent.type(screen.getByPlaceholderText(/email/i), "a@b.com");
    await userEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    expect(onEmailLogin).toHaveBeenCalledWith("a@b.com");
  });

  it("blocks an invalid email and shows a message", async () => {
    const onEmailLogin = vi.fn();
    render(<AuthScreen onGuest={vi.fn()} onEmailLogin={onEmailLogin} />);
    await userEvent.type(screen.getByPlaceholderText(/email/i), "nope");
    await userEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    expect(onEmailLogin).not.toHaveBeenCalled();
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
  });

  it("shows an error when login fails", async () => {
    const onEmailLogin = vi.fn().mockRejectedValue(new Error("boom"));
    render(<AuthScreen onGuest={vi.fn()} onEmailLogin={onEmailLogin} />);
    await userEvent.type(screen.getByPlaceholderText(/email/i), "a@b.com");
    await userEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    expect(await screen.findByText(/couldn't sign you in/i)).toBeInTheDocument();
  });
});
