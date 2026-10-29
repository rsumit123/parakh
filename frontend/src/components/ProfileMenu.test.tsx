import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileMenu } from "./ProfileMenu";

function setup(over = {}) {
  const props = { label: "a@b.com", isGuest: false, onHistory: vi.fn(), onSignOut: vi.fn(), ...over };
  render(<ProfileMenu {...props} />);
  return props;
}

describe("ProfileMenu", () => {
  it("is closed initially and opens on click", async () => {
    setup();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/profile menu/i));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("shows the email for a logged-in user", async () => {
    setup({ label: "a@b.com", isGuest: false });
    await userEvent.click(screen.getByLabelText(/profile menu/i));
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /log out/i })).toBeInTheDocument();
  });

  it("shows Guest + Reset session for a guest", async () => {
    setup({ isGuest: true, label: "Guest" });
    await userEvent.click(screen.getByLabelText(/profile menu/i));
    expect(screen.getByText("Guest")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /reset session/i })).toBeInTheDocument();
  });

  it("fires onHistory and onSignOut", async () => {
    const props = setup();
    await userEvent.click(screen.getByLabelText(/profile menu/i));
    await userEvent.click(screen.getByRole("menuitem", { name: /scan history/i }));
    expect(props.onHistory).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByLabelText(/profile menu/i));
    await userEvent.click(screen.getByRole("menuitem", { name: /log out/i }));
    expect(props.onSignOut).toHaveBeenCalledOnce();
  });

  it("offers Your targets to signed-in users only", () => {
    const onTargets = vi.fn();
    const { unmount } = render(<ProfileMenu label="a@b.com" isGuest={false} onHistory={() => {}} onTargets={onTargets} onSignOut={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /your targets/i }));
    expect(onTargets).toHaveBeenCalled();
    unmount();
    render(<ProfileMenu label="Guest" isGuest onHistory={() => {}} onTargets={onTargets} onSignOut={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    expect(screen.queryByRole("menuitem", { name: /your targets/i })).not.toBeInTheDocument();
  });
});

