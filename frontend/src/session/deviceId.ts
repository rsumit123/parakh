const KEY = "parakh.deviceId";

export function getDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `dev-${Date.now()}-${Math.floor(Math.random() * 1e9)}`);
    localStorage.setItem(KEY, id);
  }
  return id;
}
