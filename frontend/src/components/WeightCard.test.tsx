import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WeightCard } from "./WeightCard";
import * as api from "../api/diet";

vi.mock("../api/diet", async (orig) => ({ ...(await orig()), getWeight: vi.fn(), logWeight: vi.fn(), deleteWeight: vi.fn() }));
const DATA: api.WeightData = { goal: "lose", latest: { day: "2026-10-30", weight_kg: 68.9 },
  entries: [{ day: "2026-10-16", weight_kg: 69.8 }, { day: "2026-10-23", weight_kg: 69.4 }, { day: "2026-10-30", weight_kg: 68.9 }] };

describe("WeightCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the latest weight and the week's change toward the goal", async () => {
    vi.mocked(api.getWeight).mockResolvedValue(DATA);
    render(<WeightCard token="t" today="2026-10-31" />);
    expect(await screen.findByText("68.9")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText("↓ 0.5 kg in 7 days")).toHaveClass(/good/);
  });

  it("logs today's weight from the sheet", async () => {
    vi.mocked(api.getWeight).mockResolvedValue(DATA);
    vi.mocked(api.logWeight).mockResolvedValue({ ...DATA, latest: { day: "2026-10-31", weight_kg: 68.7 },
      entries: [...DATA.entries, { day: "2026-10-31", weight_kg: 68.7 }] });
    render(<WeightCard token="t" today="2026-10-31" />);
    fireEvent.click(await screen.findByRole("button", { name: "＋ Log" }));
    expect(screen.getByLabelText("Weight in kg")).toHaveValue(68.9);   // starts from the last one
    fireEvent.click(screen.getByRole("button", { name: "Less 0.1 kg" }));
    fireEvent.click(screen.getByRole("button", { name: "Less 0.1 kg" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.logWeight).toHaveBeenCalledWith("t", "2026-10-31", 68.7));
    expect(await screen.findByText("68.7")).toBeInTheDocument();
  });

  it("invites a first weigh-in", async () => {
    vi.mocked(api.getWeight).mockResolvedValue({ entries: [], latest: null, goal: null });
    render(<WeightCard token="t" today="2026-10-31" />);
    expect(await screen.findByText(/Weigh in once a week/)).toBeInTheDocument();
  });
});
