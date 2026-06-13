import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TargetsScreen } from "./TargetsScreen";

vi.mock("../api/diet", async (orig) => ({
  ...(await orig()),
  getProfile: vi.fn(() => Promise.resolve({ profile: { target_overrides: {} },
    effective_targets: { energy_kj: 8368, sugars_g: 50, sat_fat_g: 22, salt_g: 5, fibre_g: 30, protein_g: 50 } })),
  putProfile: vi.fn(() => Promise.resolve({ profile: {}, effective_targets: {} as never })),
}));

describe("TargetsScreen", () => {
  it("loads current targets and saves an override", async () => {
    const { putProfile } = await import("../api/diet");
    render(<TargetsScreen token="t" onBack={() => {}} />);
    await waitFor(() => expect(screen.getAllByDisplayValue("50").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(putProfile).toHaveBeenCalled();
  });
});
