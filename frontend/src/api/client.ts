export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(`API error ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function apiUrl(path: string, base = import.meta.env.VITE_API_BASE_URL ?? ""): string {
  return base ? `${base}${path}` : path;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  token?: string;
  body?: BodyInit;
  json?: unknown;
}

export async function fetchJson<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { token, json, headers, body, ...rest } = opts;
  const finalHeaders: Record<string, string> = { ...(headers as Record<string, string>) };
  let finalBody = body;
  if (json !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    finalBody = JSON.stringify(json);
  }
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  const res = await fetch(apiUrl(path), { ...rest, headers: finalHeaders, body: finalBody });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const detail = (payload as { detail?: unknown } | null)?.detail ?? payload;
    throw new ApiError(res.status, detail);
  }
  return payload as T;
}
