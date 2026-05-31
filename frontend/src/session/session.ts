import { fetchJson } from "../api/client";
import { getDeviceId } from "./deviceId";

const TOKEN_KEY = "parakh.token";

export function loadToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
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
  return token;
}
