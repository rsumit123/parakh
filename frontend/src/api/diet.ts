import { fetchJson } from "./client";

export type MacroKey = "energy_kj" | "sugars_g" | "sat_fat_g" | "salt_g" | "fibre_g" | "protein_g";
export type Macros = Record<MacroKey, number>;
export type MacroStatus = "low" | "ok" | "over";
export type Meal = "breakfast" | "lunch" | "snack" | "dinner";

export interface LogEntry {
  id: number; day: string; kind: string; barcode: string | null;
  name: string; brand: string; quantity_g: number; image_url: string;
  meal: Meal | null; created_at: string | null;
  energy_kj: number; sugars_g: number; sat_fat_g: number; salt_g: number;
  fibre_g: number; protein_g: number;
}
export interface DietDay {
  date: string; entries: LogEntry[]; targets: Macros; totals: Macros;
  status: Record<MacroKey, MacroStatus>; headline: string;
  personalised?: boolean;
}
export interface MealItem { name: string; portion_g: number; per100g: Macros; }
export interface MealEstimate { items: MealItem[]; }
export interface LogBody {
  kind: "packaged" | "unpackaged" | "manual";
  barcode?: string | null; name: string; brand?: string;
  quantity_g: number; per100g?: Macros; image_url?: string; day?: string;
  meal?: Meal; photo_key?: string;
}

const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function getDay(token: string, date = localDay()): Promise<DietDay> {
  return fetchJson<DietDay>(`/diet/day?date=${date}`, { token });
}
export function addLog(token: string, body: LogBody): Promise<{ entry: LogEntry } & DietDay> {
  return fetchJson(`/diet/log`, { token, method: "POST", json: { day: localDay(), ...body } });
}
export function deleteLog(token: string, id: number): Promise<{ ok: boolean } & DietDay> {
  // The server answers with the deleted entry's own day.
  return fetchJson(`/diet/log/${id}`, { token, method: "DELETE" });
}
export interface LogEdit { name?: string; quantity_g?: number; macros?: Macros; meal?: Meal; }
export function editLog(token: string, id: number, edit: LogEdit): Promise<{ entry: LogEntry } & DietDay> {
  return fetchJson(`/diet/log/${id}`, { token, method: "PATCH", json: edit });
}
export interface HistoryDay { date: string; count: number; totals: Macros; }
export function getHistory(token: string, days: number, end: string): Promise<{ targets: Macros; days: HistoryDay[] }> {
  return fetchJson(`/diet/history?days=${days}&end=${end}`, { token });
}
/** Stores a meal photo privately; returns the key to attach when logging. */
export function uploadMealPhoto(token: string, photo: Blob): Promise<{ photo_key: string; url: string }> {
  const fd = new FormData();
  fd.append("image", photo, "meal.jpg");
  return fetchJson(`/diet/photo`, { token, method: "POST", body: fd });
}
export function estimateMeal(token: string, file: File): Promise<MealEstimate> {
  const fd = new FormData();
  fd.append("image", file);
  return fetchJson<MealEstimate>(`/diet/estimate`, { token, method: "POST", body: fd });
}
export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active";
export type Goal = "lose" | "maintain" | "gain";
export interface Profile {
  sex: Sex | null; age: number | null; weight_kg: number | null; height_cm: number | null;
  activity: Activity | null; goal: Goal | null; target_overrides: Partial<Macros>;
}
export interface ProfileResponse {
  profile: Profile; personalised: boolean;
  effective_targets: Macros;   // what the day view uses (overrides applied)
  computed_targets: Macros;    // from the profile alone (or defaults)
}
export function getProfile(token: string): Promise<ProfileResponse> {
  return fetchJson(`/diet/profile`, { token });
}
export function putProfile(token: string, body: Partial<Profile>): Promise<ProfileResponse> {
  return fetchJson(`/diet/profile`, { token, method: "PUT", json: body });
}
export interface RecentFood {
  name: string; brand: string; kind: string; barcode: string | null;
  quantity_g: number; meal: Meal | null; last_day: string; uses: number; per100g: Macros;
}
export function getRecent(token: string): Promise<{ items: RecentFood[] }> {
  return fetchJson(`/diet/recent`, { token });
}
export { localDay };
