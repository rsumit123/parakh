import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingOverlay } from "./LoadingOverlay";

describe("LoadingOverlay", () => {
  it("shows the default Parakhing message as a status", () => {
    render(<LoadingOverlay />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/parakhing your food/i);
  });

  it("accepts a custom message", () => {
    render(<LoadingOverlay message="Reading…" />);
    expect(screen.getByText("Reading…")).toBeInTheDocument();
  });
});
