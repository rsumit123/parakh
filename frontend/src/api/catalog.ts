import { fetchJson } from "./client";
import type { CategoryCount, Product } from "./types";

export function fetchCategories(token: string): Promise<{ categories: CategoryCount[] }> {
  return fetchJson<{ categories: CategoryCount[] }>("/catalog/categories", { token });
}

export interface CatalogQuery {
  category?: string;
  grade?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export function fetchCatalogProducts(
  token: string,
  params: CatalogQuery,
): Promise<{ items: Product[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.category) qs.set("category", params.category);
  if (params.grade) qs.set("grade", params.grade);
  if (params.q && params.q.trim()) qs.set("q", params.q.trim());
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  return fetchJson<{ items: Product[]; total: number }>(`/catalog/products?${qs.toString()}`, { token });
}
