import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabBar } from "./TabBar";

describe("TabBar", () => {
  it("renders three tabs and marks the active one", () => {
    render(<TabBar active="explore" onSelect={() => {}} />);
    for (const t of ["Home", "Explore", "History"]) expect(screen.getByText(t)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /explore/i })).toHaveAttribute("aria-current", "page");
  });
  it("calls onSelect", async () => {
    const onSelect = vi.fn();
    render(<TabBar active="home" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /history/i }));
    expect(onSelect).toHaveBeenCalledWith("history");
  });
});
