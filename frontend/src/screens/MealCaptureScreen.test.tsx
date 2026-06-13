import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MealCaptureScreen } from "./MealCaptureScreen";

vi.mock("../api/diet", async (orig) => ({
  ...(await orig()),
  estimateMeal: vi.fn(() => Promise.resolve({ name: "Dal rice", portion_g: 350,
    per100g: { energy_kj: 500, sugars_g: 2, sat_fat_g: 1, salt_g: 0.3, fibre_g: 2, protein_g: 4 } })),
}));

describe("MealCaptureScreen", () => {
  it("estimates from a chosen gallery photo and calls onEstimated", async () => {
    const onEstimated = vi.fn();
    render(<MealCaptureScreen token="t" onEstimated={onEstimated} onBack={() => {}} />);
    fireEvent.change(screen.getByTestId("meal-gallery"),
      { target: { files: [new File(["x"], "m.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(onEstimated).toHaveBeenCalledWith(expect.objectContaining({ name: "Dal rice" })));
  });

  it("offers a gallery option even when the camera is unavailable", () => {
    render(<MealCaptureScreen token="t" onEstimated={() => {}} onBack={() => {}} />);
    expect(screen.getByTestId("meal-gallery")).toBeInTheDocument();
  });
});
