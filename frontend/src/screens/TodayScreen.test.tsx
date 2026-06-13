import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TodayScreen } from "./TodayScreen";
import type { DietDay } from "../api/diet";

const DAY: DietDay = {
  date: "2026-06-13",
  headline: "You're low on fibre & protein, and over on sugar.",
  targets: { energy_kj: 8368, sugars_g: 50, sat_fat_g: 22, salt_g: 5, fibre_g: 30, protein_g: 50 },
  totals: { energy_kj: 6000, sugars_g: 61, sat_fat_g: 14, salt_g: 4.1, fibre_g: 11, protein_g: 38 },
  status: { energy_kj: "ok", sugars_g: "over", sat_fat_g: "ok", salt_g: "ok", fibre_g: "low", protein_g: "low" },
  entries: [{ id: 1, day: "2026-06-13", kind: "packaged", barcode: "b1", name: "Amul Lassi",
              brand: "Amul", quantity_g: 200, image_url: "", energy_kj: 260, sugars_g: 29,
              sat_fat_g: 2, salt_g: 0.1, fibre_g: 0, protein_g: 4.2 }],
};

vi.mock("../api/diet", async (orig) => ({ ...(await orig()), getDay: vi.fn(() => Promise.resolve(DAY)), deleteLog: vi.fn() }));

describe("TodayScreen", () => {
  it("renders headline, a macro row, and a logged entry", async () => {
    render(<TodayScreen token="t" onAddFood={() => {}} onOpenTargets={() => {}} />);
    await waitFor(() => expect(screen.getByText(/over on sugar/i)).toBeInTheDocument());
    expect(screen.getByText("Protein")).toBeInTheDocument();
    expect(screen.getByText("Amul Lassi")).toBeInTheDocument();
  });
});
