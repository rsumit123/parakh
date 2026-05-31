import { describe, it, expect, beforeEach } from "vitest";
import { getDeviceId } from "./deviceId";

beforeEach(() => localStorage.clear());

describe("getDeviceId", () => {
  it("generates and persists a stable id", () => {
    const a = getDeviceId();
    expect(a).toMatch(/.+/);
    const b = getDeviceId();
    expect(b).toBe(a); // stable across calls
  });

  it("survives a simulated reload by reading localStorage", () => {
    const a = getDeviceId();
    // new "session" still reads the persisted value
    expect(localStorage.getItem("parakh.deviceId")).toBe(a);
  });
});
