import { fetchJson, ApiError } from "../api/client";
import type { ScanResult } from "../api/types";

export class NeedsPhotoError extends Error {
  constructor() {
    super("product not found, needs photo");
    this.name = "NeedsPhotoError";
  }
}

export class RateLimitError extends Error {
  constructor() {
    super("daily scan limit reached");
    this.name = "RateLimitError";
  }
}

export class UnreadableLabelError extends Error {
  constructor() {
    super("could not read label");
    this.name = "UnreadableLabelError";
  }
}

export async function scanBarcode(barcode: string, token: string): Promise<ScanResult> {
  try {
    return await fetchJson<ScanResult>("/scan/barcode", { method: "POST", token, json: { barcode } });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) throw new NeedsPhotoError();
    if (e instanceof ApiError && e.status === 429) throw new RateLimitError();
    throw e;
  }
}

export async function scanPhoto(barcode: string, image: Blob, token: string): Promise<ScanResult> {
  const form = new FormData();
  form.set("barcode", barcode);
  form.set("image", image, "label.jpg");
  try {
    return await fetchJson<ScanResult>("/scan/photo", { method: "POST", token, body: form });
  } catch (e) {
    if (e instanceof ApiError && e.status === 422) throw new UnreadableLabelError();
    if (e instanceof ApiError && e.status === 429) throw new RateLimitError();
    throw e;
  }
}
