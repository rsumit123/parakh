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

export async function googleLogin(
  idToken: string,
): Promise<{ token: string; email: string | null }> {
  const res = await fetchJson<{ token: string; email: string; name: string | null; avatar_url: string | null }>(
    "/auth/google",
    { method: "POST", json: { id_token: idToken } },
  );
  saveToken(res.token);
  if (res.email) localStorage.setItem(EMAIL_KEY, res.email);
  return { token: res.token, email: res.email || null };
}
