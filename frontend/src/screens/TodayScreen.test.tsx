import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { TodayScreen } from "./TodayScreen";
import * as api from "../api/diet";
import type { DietDay } from "../api/diet";

const T = { energy_kj: 8368, sugars_g: 50, sat_fat_g: 22, salt_g: 5, fibre_g: 30, protein_g: 50 , carbs_g: 0, fat_g: 0};
const DAY: DietDay = {
  date: "2026-06-13",
  headline: "You're low on fibre & protein, and over on sugar.",
  targets: T,
  totals: { energy_kj: 6000, sugars_g: 61, sat_fat_g: 14, salt_g: 4.1, fibre_g: 11, protein_g: 38 , carbs_g: 0, fat_g: 0},
  status: { energy_kj: "ok", sugars_g: "over", sat_fat_g: "ok", salt_g: "ok", fibre_g: "low", protein_g: "low", carbs_g: "ok", fat_g: "ok" },
  personalised: false,
  entries: [{ id: 1, day: "2026-06-13", kind: "packaged", barcode: "b1", name: "Amul Lassi",
              brand: "Amul", quantity_g: 200, image_url: "", meal: "breakfast", created_at: null, energy_kj: 260, sugars_g: 29,
              sat_fat_g: 2, salt_g: 0.1, fibre_g: 0, protein_g: 4.2 , carbs_g: 0, fat_g: 0}],
};

vi.mock("../api/diet", async (orig) => ({
  ...(await orig()),
  getDay: vi.fn(() => Promise.resolve(DAY)),
  getHistory: vi.fn(() => Promise.resolve({ targets: T, days: [] })),
  deleteLog: vi.fn(() => Promise.resolve({ ok: true, ...DAY, entries: [] })),
  editLog: vi.fn(() => Promise.resolve({ entry: DAY.entries[0], ...DAY })),
  addLog: vi.fn(() => Promise.resolve({ entry: { ...DAY.entries[0], id: 9 }, ...DAY })),
  getSuggestions: vi.fn(() => Promise.resolve({ date: "2026-06-13", slots: {
    breakfast: [], lunch: [], snack: [],
    dinner: [
      { source_day: "2026-06-12", times: 3, entry_ids: [41, 42], kcal: 491, protein_g: 22.2,
        items: [{ name: "Roti", quantity_g: 80, kcal: 211 }, { name: "Paneer Sabzi", quantity_g: 100, kcal: 280 }] },
      { source_day: "2026-06-10", times: 1, entry_ids: [30], kcal: 411, protein_g: 17,
        items: [{ name: "Roti + Palak Paneer", quantity_g: 180, kcal: 411 }] },
    ] } })),
  repeatMeal: vi.fn(() => {
    const created = [{ ...DAY.entries[0], id: 51, meal: "dinner", name: "Roti" },
                     { ...DAY.entries[0], id: 52, meal: "dinner", name: "Paneer Sabzi" }];
    return Promise.resolve({ ...DAY, entries: [...DAY.entries, ...created], created });
  }),
  getRecent: vi.fn(() => Promise.resolve({ items: [
    { name: "Poha", brand: "", kind: "unpackaged", barcode: null, quantity_g: 150, meal: "breakfast",
      last_day: "2026-06-12", uses: 3,
      per100g: { energy_kj: 600, sugars_g: 2, sat_fat_g: 1, salt_g: 0.5, fibre_g: 2, protein_g: 3 , carbs_g: 0, fat_g: 0} },
    { name: "Amul Lassi", brand: "Amul", kind: "packaged", barcode: "b1", quantity_g: 200, meal: null,
      last_day: "2026-06-13", uses: 1,
      per100g: { energy_kj: 130, sugars_g: 14.5, sat_fat_g: 1, salt_g: 0.05, fibre_g: 0, protein_g: 2.1 , carbs_g: 0, fat_g: 0} },
  ] })),
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
    fireEvent.click(within(screen.getByRole("dialog", { name: "Add food" })).getByRole("button", { name: /^add/i }));
    await waitFor(() => expect(api.addLog).toHaveBeenCalled());
    const body = vi.mocked(api.addLog).mock.calls[0][1];
    expect(body).toMatchObject({ kind: "manual", name: "Banana", quantity_g: 100, day: "2026-06-10" });
    expect(Math.round(body.per100g!.energy_kj)).toBe(377);
  });

  it("can't step past today", async () => {
    renderToday();
    expect(await screen.findByRole("button", { name: "Next day" })).toBeDisabled();
  });

  it("groups entries under their meal and invites personalising", async () => {
    renderToday();
    expect(await screen.findByRole("region", { name: "Breakfast" })).toHaveTextContent("Amul Lassi");
    expect(screen.getByText(/personalise your targets/i)).toBeInTheDocument();
  });

  it("re-logs a recent food in one tap, and Undo removes it", async () => {
    renderToday();
    fireEvent.click(await screen.findByRole("button", { name: /add food/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Poha again" }));
    await waitFor(() => expect(api.addLog).toHaveBeenCalled());
    expect(vi.mocked(api.addLog).mock.calls[0][1]).toMatchObject({
      kind: "unpackaged", name: "Poha", quantity_g: 150, day: "2026-06-13" });
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(api.deleteLog).toHaveBeenCalledWith("t", 9));
  });

  it("re-logs packaged foods by barcode and lists frequent foods", async () => {
    renderToday();
    fireEvent.click(await screen.findByRole("button", { name: /add food/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Amul Lassi again" }));
    await waitFor(() => expect(api.addLog).toHaveBeenCalled());
    expect(vi.mocked(api.addLog).mock.calls[0][1]).toMatchObject({ kind: "packaged", barcode: "b1", quantity_g: 200 });
    fireEvent.click(await screen.findByRole("button", { name: /add food/i }));
    fireEvent.click(await screen.findByRole("tab", { name: "Frequent" }));
    expect(within(screen.getByRole("dialog", { name: "Add food" })).getByText(/3×/)).toBeInTheDocument();  // Poha, used 3 times
    expect(screen.queryByRole("button", { name: "Add Amul Lassi again" })).not.toBeInTheDocument();
  });

  it("deleting shows Undo, which restores the entry", async () => {
    renderToday();
    fireEvent.click(await screen.findByRole("button", { name: "Remove Amul Lassi" }));
    await waitFor(() => expect(api.deleteLog).toHaveBeenCalledWith("t", 1));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(api.addLog).toHaveBeenCalled());
    expect(vi.mocked(api.addLog).mock.calls[0][1]).toMatchObject({ name: "Amul Lassi", quantity_g: 200, meal: "breakfast" });
  });

  it("shows a logged meal's photo as its thumbnail and in the editor", async () => {
    vi.mocked(api.getDay).mockResolvedValueOnce({ ...DAY,
      entries: [{ ...DAY.entries[0], image_url: "https://signed/meals/user-1/a.jpg" }] });
    const { container } = renderToday();
    await screen.findByText("Amul Lassi");
    expect(container.querySelector('img[src="https://signed/meals/user-1/a.jpg"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit Amul Lassi" }));
    expect(screen.getByAltText("Your meal")).toHaveAttribute("src", "https://signed/meals/user-1/a.jpg");
  });

  it("shows carbs and fat, flagging totals that are missing data", async () => {
    vi.mocked(api.getDay).mockResolvedValueOnce({ ...DAY, partial: ["carbs_g"] });
    renderToday();
    expect(await screen.findByText("Carbs")).toBeInTheDocument();
    expect(screen.getByText("Fat")).toBeInTheDocument();
    expect(screen.getByText(/no carb data/i)).toBeInTheDocument();
  });

  it("suggests the usual meal in an empty slot and adds it in one tap, with Undo", async () => {
    renderToday();
    const dinner = await screen.findByRole("region", { name: "Dinner" });
    expect(dinner).toHaveTextContent("Usual dinner · 3×");
    expect(dinner).toHaveTextContent("Roti · Paneer Sabzi");
    expect(screen.queryByRole("region", { name: "Lunch" })).not.toBeInTheDocument();  // nothing to suggest
    fireEvent.click(screen.getByRole("button", { name: /add usual dinner/i }));
    await waitFor(() => expect(api.repeatMeal).toHaveBeenCalledWith("t", [41, 42], "2026-06-13", "dinner"));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(vi.mocked(api.deleteLog).mock.calls.map((c) => c[1])).toEqual([51, 52]));
  });

  it("offers the runner-up meal too", async () => {
    renderToday();
    fireEvent.click(await screen.findByRole("button", { name: /add dinner: roti \+ palak paneer/i }));
    await waitFor(() => expect(api.repeatMeal).toHaveBeenCalledWith("t", [30], "2026-06-13", "dinner"));
  });
});

