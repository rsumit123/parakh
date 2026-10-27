import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TodayScreen } from "./TodayScreen";
import * as api from "../api/diet";
import type { DietDay } from "../api/diet";

const T = { energy_kj: 8368, sugars_g: 50, sat_fat_g: 22, salt_g: 5, fibre_g: 30, protein_g: 50 };
const DAY: DietDay = {
  date: "2026-06-13",
  headline: "You're low on fibre & protein, and over on sugar.",
  targets: T,
  totals: { energy_kj: 6000, sugars_g: 61, sat_fat_g: 14, salt_g: 4.1, fibre_g: 11, protein_g: 38 },
  status: { energy_kj: "ok", sugars_g: "over", sat_fat_g: "ok", salt_g: "ok", fibre_g: "low", protein_g: "low" },
  entries: [{ id: 1, day: "2026-06-13", kind: "packaged", barcode: "b1", name: "Amul Lassi",
              brand: "Amul", quantity_g: 200, image_url: "", energy_kj: 260, sugars_g: 29,
              sat_fat_g: 2, salt_g: 0.1, fibre_g: 0, protein_g: 4.2 }],
};

vi.mock("../api/diet", async (orig) => ({
  ...(await orig()),
  getDay: vi.fn(() => Promise.resolve(DAY)),
  getHistory: vi.fn(() => Promise.resolve({ targets: T, days: [] })),
  deleteLog: vi.fn(() => Promise.resolve({ ok: true, ...DAY, entries: [] })),
  editLog: vi.fn(() => Promise.resolve({ entry: DAY.entries[0], ...DAY })),
  addLog: vi.fn(() => Promise.resolve({ entry: DAY.entries[0], ...DAY })),
}));

const renderToday = (date = "2026-06-13") => render(
  <TodayScreen token="t" date={date} today="2026-06-13" onChangeDate={() => {}}
    onSnapMeal={() => {}} onOpenTargets={() => {}} />);

describe("TodayScreen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders headline, a macro row, and a logged entry", async () => {
    renderToday();
    await waitFor(() => expect(screen.getByText(/over on sugar/i)).toBeInTheDocument());
    expect(screen.getByText("Protein")).toBeInTheDocument();
    expect(screen.getByText("Amul Lassi")).toBeInTheDocument();
  });

  it("tapping an entry opens the editor and saves the edit", async () => {
    renderToday();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Amul Lassi" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(api.editLog).toHaveBeenCalled());
    const [, id, edit] = vi.mocked(api.editLog).mock.calls[0];
    expect(id).toBe(1);
    expect(edit.quantity_g).toBe(100);
    expect(edit.macros!.sugars_g).toBe(14.5);  // 29 g for 200 g -> 14.5 g for 100 g
  });

  it("manual add logs to the day being viewed", async () => {
    renderToday("2026-06-10");
    fireEvent.click(await screen.findByRole("button", { name: /add food/i }));
    fireEvent.click(screen.getByRole("button", { name: /enter manually/i }));
    fireEvent.change(screen.getByLabelText("Food name"), { target: { value: "Banana" } });
    fireEvent.change(screen.getByLabelText("Energy in kcal"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: /^add/i }));
    await waitFor(() => expect(api.addLog).toHaveBeenCalled());
    const body = vi.mocked(api.addLog).mock.calls[0][1];
    expect(body).toMatchObject({ kind: "manual", name: "Banana", quantity_g: 100, day: "2026-06-10" });
    expect(Math.round(body.per100g!.energy_kj)).toBe(377);
  });

  it("can't step past today", async () => {
    renderToday();
    expect(await screen.findByRole("button", { name: "Next day" })).toBeDisabled();
  });
});
