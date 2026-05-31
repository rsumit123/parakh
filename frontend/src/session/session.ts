import { fetchJson } from "../api/client";
import { getDeviceId } from "./deviceId";

const TOKEN_KEY = "parakh.token";
const EMAIL_KEY = "parakh.email";

export function loadToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
}

export function loadEmail(): string | null {
  return localStorage.getItem(EMAIL_KEY);
}

/** A token is for a logged-in (email) user when its payload starts with "user:". */
export function isGuestToken(token: string | null): boolean {
  return !token || token.startsWith("guest:");
}

export async function guestLogin(): Promise<string> {
  const { token } = await fetchJson<{ token: string }>("/auth/guest", {
    method: "POST",
    json: { device_id: getDeviceId() },
  });
  saveToken(token);
  return token;
}

export async function emailLogin(email: string): Promise<string> {
  const { token } = await fetchJson<{ token: string }>("/auth/login", {
    method: "POST",
    json: { email },
  });
  saveToken(token);
  localStorage.setItem(EMAIL_KEY, email);
  return token;
}
