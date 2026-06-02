import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Thumb } from "./Thumb";

describe("Thumb", () => {
  it("shows the placeholder when there is no src", () => {
    render(<Thumb alt="x" className="box" />);
    expect(screen.getByText("🛒")).toBeInTheDocument();
  });

  it("renders the image with a skeleton that disappears on load", () => {
    render(<Thumb src="http://x/a.jpg" alt="Cola" className="box" />);
    expect(screen.getByAltText("Cola")).toBeInTheDocument();
    expect(screen.getByTestId("thumb-skeleton")).toBeInTheDocument();
    fireEvent.load(screen.getByAltText("Cola"));
    expect(screen.queryByTestId("thumb-skeleton")).not.toBeInTheDocument();
  });

  it("falls back to the placeholder when the image errors", () => {
    render(<Thumb src="http://x/bad.jpg" alt="Cola" className="box" />);
    fireEvent.error(screen.getByAltText("Cola"));
    expect(screen.getByText("🛒")).toBeInTheDocument();
  });
});
