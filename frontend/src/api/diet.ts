import { fetchJson } from "./client";

export type MacroKey = "energy_kj" | "sugars_g" | "sat_fat_g" | "salt_g" | "fibre_g" | "protein_g";
export type Macros = Record<MacroKey, number>;
export type MacroStatus = "low" | "ok" | "over";

export interface LogEntry {
  id: number; day: string; kind: string; barcode: string | null;
  name: string; brand: string; quantity_g: number; image_url: string;
  energy_kj: number; sugars_g: number; sat_fat_g: number; salt_g: number;
  fibre_g: number; protein_g: number;
}
export interface DietDay {
  date: string; entries: LogEntry[]; targets: Macros; totals: Macros;
  status: Record<MacroKey, MacroStatus>; headline: string;
}
export interface MealItem { name: string; portion_g: number; per100g: Macros; }
export interface MealEstimate { items: MealItem[]; }
export interface LogBody {
  kind: "packaged" | "unpackaged" | "manual";
  barcode?: string | null; name: string; brand?: string;
  quantity_g: number; per100g?: Macros; image_url?: string; day?: string;
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
  return fetchJson(`/diet/log/${id}?date=${localDay()}`, { token, method: "DELETE" });
}
export function estimateMeal(token: string, file: File): Promise<MealEstimate> {
  const fd = new FormData();
  fd.append("image", file);
  return fetchJson<MealEstimate>(`/diet/estimate`, { token, method: "POST", body: fd });
}
export function getProfile(token: string): Promise<{ profile: Record<string, unknown>; effective_targets: Macros }> {
  return fetchJson(`/diet/profile`, { token });
}
export function putProfile(token: string, body: Record<string, unknown>): Promise<{ profile: Record<string, unknown>; effective_targets: Macros }> {
  return fetchJson(`/diet/profile`, { token, method: "PUT", json: body });
}
export { localDay };
