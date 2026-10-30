import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TargetsScreen } from "./TargetsScreen";
import * as api from "../api/diet";

const DEF = { energy_kj: 8368, sugars_g: 50, sat_fat_g: 22, salt_g: 5, fibre_g: 40, protein_g: 50 , carbs_g: 0, fat_g: 0};
const EMPTY = { sex: null, age: null, weight_kg: null, height_cm: null, activity: null, goal: null };

vi.mock("../api/diet", async (orig) => ({
  ...(await orig()),
  getProfile: vi.fn(),
  putProfile: vi.fn(() => Promise.resolve({})),
}));

const respond = (profile: object) => vi.mocked(api.getProfile).mockResolvedValue({
  profile: { ...EMPTY, target_overrides: {}, ...profile } as api.Profile,
  personalised: false, effective_targets: DEF, computed_targets: DEF,
});

describe("TargetsScreen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calculates targets live from About you and saves the profile without overrides", async () => {
    respond({});
    render(<TargetsScreen token="t" onBack={() => {}} />);
    expect(await screen.findByLabelText("Energy target")).toHaveValue(2000);
    fireEvent.click(screen.getByRole("radio", { name: "Male" }));
    fireEvent.change(screen.getByLabelText("Age in years"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Height in cm"), { target: { value: "175" } });
    fireEvent.change(screen.getByLabelText("Weight in kg"), { target: { value: "70" } });
    fireEvent.click(screen.getByRole("radio", { name: /moderately active/i }));
    fireEvent.click(screen.getByRole("radio", { name: "Maintain" }));
    expect(screen.getByLabelText("Energy target")).toHaveValue(2715);
    expect(screen.getByLabelText("Protein target")).toHaveValue(58);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.putProfile).toHaveBeenCalled());
    expect(vi.mocked(api.putProfile).mock.calls[0][1]).toEqual({
      sex: "male", age: 30, height_cm: 175, weight_kg: 70, activity: "moderate", goal: "maintain",
      target_overrides: {},
    });
  });

  it("keeps a custom value as an override and can reset it", async () => {
    respond({});
    render(<TargetsScreen token="t" onBack={() => {}} />);
    fireEvent.change(await screen.findByLabelText("Protein target"), { target: { value: "90" } });
    expect(screen.getByText("custom")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.putProfile).toHaveBeenCalled());
    expect(vi.mocked(api.putProfile).mock.calls[0][1].target_overrides).toEqual({ protein_g: 90 });
    fireEvent.click(screen.getByRole("button", { name: "Reset Protein to calculated" }));
    expect(screen.getByLabelText("Protein target")).toHaveValue(50);
  });

  it("ignores legacy overrides that just repeat the calculated values", async () => {
    respond({ target_overrides: { ...DEF, salt_g: 4 } });  // old app saved every target
    render(<TargetsScreen token="t" onBack={() => {}} />);
    await screen.findByLabelText("Salt target");
    expect(screen.getAllByText("custom")).toHaveLength(1);   // only salt differs
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.putProfile).toHaveBeenCalled());
    expect(vi.mocked(api.putProfile).mock.calls[0][1].target_overrides).toEqual({ salt_g: 4 });
  });

  it("updates the preview as soon as one choice is made, labelled estimated", async () => {
    respond({});
    render(<TargetsScreen token="t" onBack={() => {}} />);
    expect(await screen.findByLabelText("Energy target")).toHaveValue(2000);
    fireEvent.click(screen.getByRole("radio", { name: /very active/i }));
    expect(Number((screen.getByLabelText("Energy target") as HTMLInputElement).value)).toBeGreaterThan(2000);
    expect(screen.getAllByText("estimated").length).toBeGreaterThan(0);
    expect(screen.getByText(/add your age/i)).toBeInTheDocument();
  });

  it("shows empty fields as 'add', not a value-looking placeholder", async () => {
    respond({});
    render(<TargetsScreen token="t" onBack={() => {}} />);
    expect(await screen.findByLabelText("Age in years")).toHaveAttribute("placeholder", "add");
  });
});

