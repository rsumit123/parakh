// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let css = "";
beforeAll(() => {
  css = readFileSync(fileURLToPath(new URL("./theme.css", import.meta.url)), "utf8");
});

describe("theme tokens", () => {
  it("defines the brand palette and font tokens", () => {
    for (const token of ["--ink", "--paper", "--lime", "--green", "--green-deep", "--font"]) {
      expect(css).toContain(token);
    }
  });
  it("uses Plus Jakarta Sans", () => {
    expect(css).toContain("Plus Jakarta Sans");
  });
});
