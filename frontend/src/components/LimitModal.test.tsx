import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LimitModal } from "./LimitModal";

describe("LimitModal", () => {
  it("renders nothing when closed", () => {
    render(<LimitModal open={false} isGuest onClose={vi.fn()} onSignIn={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("nudges guests to sign in", async () => {
    const onSignIn = vi.fn();
    render(<LimitModal open isGuest onClose={vi.fn()} onSignIn={onSignIn} />);
    expect(screen.getByText(/today's free scans/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /sign in for more/i }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it("tells signed-in users to come back tomorrow (no sign-in button)", () => {
    render(<LimitModal open isGuest={false} onClose={vi.fn()} onSignIn={vi.fn()} />);
    expect(screen.getByText(/that's all for today/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();
  });

  it("closes on the scrim and on the secondary button", async () => {
    const onClose = vi.fn();
    render(<LimitModal open isGuest onClose={onClose} onSignIn={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /maybe later/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
