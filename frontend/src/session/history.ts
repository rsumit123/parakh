import type { Product } from "../api/types";

const KEY = "parakh.history";
const MAX = 50;

export interface HistoryEntry {
  at: number; // epoch ms
  product: Product;
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Prepend a scan to history, de-duplicating by barcode (most recent wins). */
export function addToHistory(product: Product, now: number): HistoryEntry[] {
  const existing = loadHistory().filter((e) => e.product.barcode !== product.barcode);
  const next = [{ at: now, product }, ...existing].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full / unavailable — history is best-effort, ignore
  }
  return next;
}

export function clearHistory(): void {
  localStorage.removeItem(KEY);
}
