# Parakh Frontend (PWA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Parakh mobile-first PWA — scan a barcode (or photograph a label), see a single A–E / 0–100 health verdict with an expandable breakdown, backed by guest + email accounts and daily scan limits.

**Architecture:** React + TypeScript (Vite), installable PWA. A thin typed API client talks to the FastAPI backend. Session state (guest device-id token or email-login token) lives in a React context backed by localStorage. The camera uses `@zxing/browser` for live barcode decoding, with a "photograph the label" fallback that POSTs an image. UI is plain CSS via CSS Modules, themed to the approved design (deep-green + lime, Plus Jakarta Sans, verdict-first score screen).

**Tech Stack:** React 18, TypeScript, Vite, Vitest + @testing-library/react + jsdom, @zxing/browser, vite-plugin-pwa. Plain CSS Modules (no Tailwind).

---

## API Contract (locked — from the merged backend)

All `/scan/*` calls require header `Authorization: Bearer <token>`.

- `POST /auth/guest` body `{device_id: string}` → `200 {token: string}`
- `POST /auth/login` body `{email: string}` → `200 {token: string}` (400 on invalid email)
- `POST /scan/barcode` body `{barcode: string}` → `200 ScanResult`
  - `404 {detail: {error, needs_photo: true}}` when unknown (prompt photo)
  - `429 {detail: {error}}` when daily quota exhausted
  - `401` when token missing/invalid
- `POST /scan/photo` multipart fields `barcode` (string) + `image` (file) → `200 ScanResult`
  - `422 {detail: {error}}` when the label can't be read (retake)
  - `429`, `401` as above

`ScanResult`:
```json
{
  "source": "db" | "off" | "photo",
  "remaining": 2,
  "product": {
    "barcode": "string", "name": "string", "brand": "string",
    "ingredients": ["string"],
    "nutrition": {"energy_kj": 0, "sugars_g": 0, "sat_fat_g": 0, "salt_g": 0, "fibre_g": 0, "protein_g": 0, "fruit_veg_nuts_pct": 0},
    "source": "db" | "off" | "photo",
    "score": {
      "overall": 84, "grade": "A", "verdict": "Good choice",
      "positives": ["Fibre (5g)"], "negatives": [],
      "breakdown": {
        "nutrients": [{"key": "sugars", "label": "Sugar", "value_g": 2.1, "pct": 18, "level": "low", "high_is_bad": true}],
        "india_flags": [{"label": "Palm oil", "note": "Flagged for India market"}]
      }
    }
  }
}
```

Grades are exactly `"A"|"B"|"C"|"D"|"E"`. Bar `level` is `"low"|"ok"|"high"`.

---

## File Structure

```
frontend/
  package.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  index.html
  .env.example
  public/
    manifest.webmanifest
    icon-192.png            # placeholder created in scaffold
    icon-512.png            # placeholder created in scaffold
  src/
    main.tsx                # React entry, mounts <App/>
    App.tsx                 # top-level: session gate + active screen state
    theme.css               # design tokens (colors, font) + global resets
    vite-env.d.ts
    api/
      types.ts              # TS types mirroring the API contract
      client.ts             # fetchJson + ApiError + base-url resolution
    session/
      deviceId.ts           # stable per-device id (localStorage)
      session.ts            # token storage + guestLogin/emailLogin/logout
      SessionContext.tsx    # React context + useSession() hook
    scan/
      scanApi.ts            # scanBarcode() / scanPhoto() typed wrappers
      grade.ts              # grade -> {color, label} mapping helpers
      useBarcodeScanner.ts  # @zxing/browser wrapper hook
    screens/
      AuthScreen.tsx        + AuthScreen.module.css
      ScanScreen.tsx        + ScanScreen.module.css
      ResultScreen.tsx      + ResultScreen.module.css
      Breakdown.tsx         + Breakdown.module.css
    components/
      ScoreRing.tsx         + ScoreRing.module.css
      TabBar.tsx            + TabBar.module.css
  src/test/
    setup.ts                # testing-library/jest-dom + vitest matchers
    <component>.test.tsx    # colocated-by-folder tests under src/**
```

Each screen owns one route/state of the app. `scan/`, `session/`, `api/` are pure logic with their own tests. Components are small and individually testable.

---

### Task 1: Scaffold the Vite React-TS PWA with Vitest

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/.env.example`
- Create: `frontend/src/vite-env.d.ts`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/public/manifest.webmanifest`
- Create: `frontend/src/smoke.test.ts`

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "parakh-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@zxing/browser": "^0.1.5",
    "@zxing/library": "^0.21.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.2",
    "vite-plugin-pwa": "^0.20.5",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `frontend/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `frontend/vite.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false, // we ship our own public/manifest.webmanifest
    }),
  ],
  server: {
    proxy: {
      "/auth": "http://localhost:8000",
      "/scan": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
```

- [ ] **Step 5: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#10211A" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <title>Parakh</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `frontend/.env.example`**

```bash
# Base URL of the Parakh backend. Leave empty to use the Vite dev proxy.
VITE_API_BASE_URL=
```

- [ ] **Step 7: Create `frontend/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
```

- [ ] **Step 8: Create `frontend/public/manifest.webmanifest`**

```json
{
  "name": "Parakh",
  "short_name": "Parakh",
  "description": "Scan packaged food, get a clear health score.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#10211A",
  "theme_color": "#10211A",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 9: Create placeholder PWA icons**

Run:
```bash
cd /Users/rsumit123/work/nutri-content/frontend
python3 - <<'PY'
import struct, zlib, pathlib
def png(path, size, rgb=(31,164,99)):
    w=h=size
    raw=bytearray()
    for _ in range(h):
        raw.append(0)
        raw += bytes(rgb) * w
    def chunk(typ, data):
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    sig=b"\x89PNG\r\n\x1a\n"
    ihdr=struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    idat=zlib.compress(bytes(raw), 9)
    pathlib.Path(path).write_bytes(sig+chunk(b"IHDR",ihdr)+chunk(b"IDAT",idat)+chunk(b"IEND",b""))
png("public/icon-192.png",192); png("public/icon-512.png",512)
print("icons written")
PY
```
Expected: prints `icons written`; `public/icon-192.png` and `public/icon-512.png` exist.

- [ ] **Step 10: Create `frontend/src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 11: Create `frontend/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./theme.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 12: Create a minimal `frontend/src/App.tsx`** (replaced in a later task)

```tsx
export default function App() {
  return <div>Parakh</div>;
}
```

- [ ] **Step 13: Create `frontend/src/theme.css`** (minimal placeholder; expanded in Task 2)

```css
:root { color-scheme: light; }
```

- [ ] **Step 14: Write the smoke test** in `frontend/src/smoke.test.ts`

```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 15: Install and run the smoke test**

Run:
```bash
cd /Users/rsumit123/work/nutri-content/frontend && npm install && npm test
```
Expected: install succeeds; Vitest runs and `smoke.test.ts` passes (1 passed).

- [ ] **Step 16: Add a frontend gitignore entry**

Append `frontend/node_modules/` and `frontend/dist/` coverage to the repo root `.gitignore` only if `node_modules/` and `dist/` patterns there are not already global. They are already present (`node_modules/`, `dist/`), so no change needed — verify with:
```bash
cd /Users/rsumit123/work/nutri-content && git check-ignore frontend/node_modules && echo OK
```
Expected: prints `frontend/node_modules` then `OK`.

- [ ] **Step 17: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/package.json frontend/package-lock.json frontend/tsconfig.json frontend/tsconfig.node.json frontend/vite.config.ts frontend/index.html frontend/.env.example frontend/public frontend/src
git commit -m "feat(frontend): scaffold Vite React-TS PWA with Vitest"
```

---

### Task 2: Design tokens and global theme

**Files:**
- Modify: `frontend/src/theme.css`
- Create: `frontend/src/theme.test.ts`

- [ ] **Step 1: Write the failing test** in `frontend/src/theme.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/theme.test.ts`
Expected: FAIL (tokens not present in the placeholder theme.css)

- [ ] **Step 3: Write `frontend/src/theme.css`**

```css
:root {
  color-scheme: light;
  --ink: #0f1512;
  --paper: #f6f5ef;
  --card: #ffffff;
  --muted: #7a8579;
  --line: #ecebe3;
  --lime: #c7f94c;
  --green: #1fa463;
  --green-deep: #0b3d2c;
  --red: #e2574c;
  --amber: #f0a23b;
  --font: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }

html, body, #root { height: 100%; }

body {
  font-family: var(--font);
  background: var(--paper);
  color: var(--ink);
}

button { font-family: inherit; cursor: pointer; border: 0; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/theme.test.ts`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/src/theme.css frontend/src/theme.test.ts
git commit -m "feat(frontend): design tokens and global theme"
```

---

### Task 3: API types

**Files:**
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/api/types.test.ts`

- [ ] **Step 1: Write the failing test** in `frontend/src/api/types.test.ts`

```ts
import { describe, it, expect } from "vitest";
import type { ScanResult, Grade } from "./types";
import { isGrade } from "./types";

describe("api types", () => {
  it("isGrade recognizes valid grades", () => {
    expect(isGrade("A")).toBe(true);
    expect(isGrade("E")).toBe(true);
    expect(isGrade("Z")).toBe(false);
    expect(isGrade("")).toBe(false);
  });

  it("a well-formed ScanResult is assignable", () => {
    const r: ScanResult = {
      source: "off",
      remaining: 2,
      product: {
        barcode: "111", name: "Chana", brand: "Tata", ingredients: ["chana"],
        nutrition: { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, fruit_veg_nuts_pct: 0 },
        source: "off",
        score: {
          overall: 84, grade: "A" as Grade, verdict: "Good choice",
          positives: ["Fibre (5g)"], negatives: [],
          breakdown: { nutrients: [{ key: "sugars", label: "Sugar", value_g: 2, pct: 18, level: "low", high_is_bad: true }], india_flags: [] },
        },
      },
    };
    expect(r.product.score.grade).toBe("A");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/api/types.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write `frontend/src/api/types.ts`**

```ts
export type Grade = "A" | "B" | "C" | "D" | "E";
export type Source = "db" | "off" | "photo";
export type BarLevel = "low" | "ok" | "high";

export function isGrade(value: string): value is Grade {
  return ["A", "B", "C", "D", "E"].includes(value);
}

export interface Nutrition {
  energy_kj: number;
  sugars_g: number;
  sat_fat_g: number;
  salt_g: number;
  fibre_g: number;
  protein_g: number;
  fruit_veg_nuts_pct: number;
}

export interface NutrientBar {
  key: string;
  label: string;
  value_g: number;
  pct: number;
  level: BarLevel;
  high_is_bad: boolean;
}

export interface IndiaFlag {
  label: string;
  note: string;
}

export interface Score {
  overall: number;
  grade: Grade;
  verdict: string;
  positives: string[];
  negatives: string[];
  breakdown: { nutrients: NutrientBar[]; india_flags: IndiaFlag[] };
}

export interface Product {
  barcode: string;
  name: string;
  brand: string;
  ingredients: string[];
  nutrition: Nutrition;
  source: Source;
  score: Score;
}

export interface ScanResult {
  source: Source;
  remaining: number;
  product: Product;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/api/types.test.ts`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/src/api/types.ts frontend/src/api/types.test.ts
git commit -m "feat(frontend): API types mirroring backend contract"
```

---

### Task 4: API client (fetch wrapper + typed errors)

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/client.test.ts`

- [ ] **Step 1: Write the failing test** in `frontend/src/api/client.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJson, ApiError, apiUrl } from "./client";

afterEach(() => vi.restoreAllMocks());

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

describe("apiUrl", () => {
  it("prefixes with VITE_API_BASE_URL when set, else returns path", () => {
    expect(apiUrl("/scan/barcode", "")).toBe("/scan/barcode");
    expect(apiUrl("/scan/barcode", "https://api.test")).toBe("https://api.test/scan/barcode");
  });
});

describe("fetchJson", () => {
  it("returns parsed JSON on success", async () => {
    mockFetch(200, { token: "t" });
    const out = await fetchJson<{ token: string }>("/auth/guest", { method: "POST" });
    expect(out.token).toBe("t");
  });

  it("throws ApiError carrying status and detail on failure", async () => {
    mockFetch(404, { detail: { error: "product not found", needs_photo: true } });
    await expect(fetchJson("/scan/barcode", { method: "POST" })).rejects.toMatchObject({
      status: 404,
    });
    try {
      mockFetch(404, { detail: { error: "x", needs_photo: true } });
      await fetchJson("/scan/barcode", { method: "POST" });
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).detail).toMatchObject({ needs_photo: true });
    }
  });

  it("attaches a bearer token when provided", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", spy);
    await fetchJson("/scan/barcode", { method: "POST", token: "abc" });
    const headers = spy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer abc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/api/client.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write `frontend/src/api/client.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/api/client.test.ts`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/src/api/client.ts frontend/src/api/client.test.ts
git commit -m "feat(frontend): typed fetch client with ApiError"
```

---

### Task 5: Device id

**Files:**
- Create: `frontend/src/session/deviceId.ts`
- Create: `frontend/src/session/deviceId.test.ts`

- [ ] **Step 1: Write the failing test** in `frontend/src/session/deviceId.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/session/deviceId.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write `frontend/src/session/deviceId.ts`**

```ts
const KEY = "parakh.deviceId";

export function getDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `dev-${Date.now()}-${Math.floor(Math.random() * 1e9)}`);
    localStorage.setItem(KEY, id);
  }
  return id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/session/deviceId.test.ts`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/src/session/deviceId.ts frontend/src/session/deviceId.test.ts
git commit -m "feat(frontend): stable per-device id"
```

---

### Task 6: Session store (token + guest/email login)

**Files:**
- Create: `frontend/src/session/session.ts`
- Create: `frontend/src/session/session.test.ts`

- [ ] **Step 1: Write the failing test** in `frontend/src/session/session.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadToken, saveToken, clearToken, guestLogin, emailLogin } from "./session";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("token storage", () => {
  it("save/load/clear round-trip", () => {
    expect(loadToken()).toBeNull();
    saveToken("tok");
    expect(loadToken()).toBe("tok");
    clearToken();
    expect(loadToken()).toBeNull();
  });
});

describe("guestLogin", () => {
  it("posts device id and stores the returned token", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "guest-tok" }) });
    vi.stubGlobal("fetch", spy);
    const token = await guestLogin();
    expect(token).toBe("guest-tok");
    expect(loadToken()).toBe("guest-tok");
    const [path, init] = spy.mock.calls[0];
    expect(path).toContain("/auth/guest");
    expect(JSON.parse(init.body).device_id).toMatch(/.+/);
  });
});

describe("emailLogin", () => {
  it("posts email and stores the returned token", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "email-tok" }) });
    vi.stubGlobal("fetch", spy);
    const token = await emailLogin("a@b.com");
    expect(token).toBe("email-tok");
    expect(loadToken()).toBe("email-tok");
    expect(JSON.parse(spy.mock.calls[0][1].body).email).toBe("a@b.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/session/session.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write `frontend/src/session/session.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/session/session.test.ts`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/src/session/session.ts frontend/src/session/session.test.ts
git commit -m "feat(frontend): session store with guest and email login"
```

---

### Task 7: Session context and hook

**Files:**
- Create: `frontend/src/session/SessionContext.tsx`
- Create: `frontend/src/session/SessionContext.test.tsx`

- [ ] **Step 1: Write the failing test** in `frontend/src/session/SessionContext.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionProvider, useSession } from "./SessionContext";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

function Probe() {
  const { token, guest, signOut } = useSession();
  return (
    <div>
      <span data-testid="token">{token ?? "none"}</span>
      <button onClick={() => guest()}>guest</button>
      <button onClick={() => signOut()}>out</button>
    </div>
  );
}

describe("SessionContext", () => {
  it("starts with no token, then guest() sets one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "g" }) }));
    render(<SessionProvider><Probe /></SessionProvider>);
    expect(screen.getByTestId("token").textContent).toBe("none");
    await userEvent.click(screen.getByText("guest"));
    expect(screen.getByTestId("token").textContent).toBe("g");
  });

  it("hydrates an existing token from storage", () => {
    localStorage.setItem("parakh.token", "stored");
    render(<SessionProvider><Probe /></SessionProvider>);
    expect(screen.getByTestId("token").textContent).toBe("stored");
  });

  it("signOut clears the token", async () => {
    localStorage.setItem("parakh.token", "stored");
    render(<SessionProvider><Probe /></SessionProvider>);
    await userEvent.click(screen.getByText("out"));
    expect(screen.getByTestId("token").textContent).toBe("none");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/session/SessionContext.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Write `frontend/src/session/SessionContext.tsx`**

```tsx
import { createContext, useContext, useState, type ReactNode } from "react";
import { loadToken, clearToken, guestLogin, emailLogin } from "./session";

interface SessionValue {
  token: string | null;
  guest: () => Promise<void>;
  login: (email: string) => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => loadToken());

  const guest = async () => setToken(await guestLogin());
  const login = async (email: string) => setToken(await emailLogin(email));
  const signOut = () => {
    clearToken();
    setToken(null);
  };

  return (
    <SessionContext.Provider value={{ token, guest, login, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/session/SessionContext.test.tsx`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/src/session/SessionContext.tsx frontend/src/session/SessionContext.test.tsx
git commit -m "feat(frontend): session context and useSession hook"
```

---

### Task 8: Scan API wrappers

**Files:**
- Create: `frontend/src/scan/scanApi.ts`
- Create: `frontend/src/scan/scanApi.test.ts`

- [ ] **Step 1: Write the failing test** in `frontend/src/scan/scanApi.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { scanBarcode, scanPhoto, NeedsPhotoError, RateLimitError } from "./scanApi";
import { ApiError } from "../api/client";

afterEach(() => vi.restoreAllMocks());

const RESULT = {
  source: "off", remaining: 2,
  product: { barcode: "1", name: "X", brand: "Y", ingredients: [], nutrition: {}, source: "off",
    score: { overall: 80, grade: "A", verdict: "Good choice", positives: [], negatives: [], breakdown: { nutrients: [], india_flags: [] } } },
};

describe("scanBarcode", () => {
  it("returns a ScanResult on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => RESULT }));
    const out = await scanBarcode("1", "tok");
    expect(out.product.score.grade).toBe("A");
    expect(out.remaining).toBe(2);
  });

  it("maps 404 to NeedsPhotoError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ detail: { needs_photo: true } }) }));
    await expect(scanBarcode("1", "tok")).rejects.toBeInstanceOf(NeedsPhotoError);
  });

  it("maps 429 to RateLimitError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ detail: { error: "limit" } }) }));
    await expect(scanBarcode("1", "tok")).rejects.toBeInstanceOf(RateLimitError);
  });

  it("rethrows other ApiErrors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ detail: "nope" }) }));
    await expect(scanBarcode("1", "tok")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("scanPhoto", () => {
  it("sends multipart and returns a ScanResult", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => RESULT });
    vi.stubGlobal("fetch", spy);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const out = await scanPhoto("1", blob, "tok");
    expect(out.product.name).toBe("X");
    const init = spy.mock.calls[0][1];
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("barcode")).toBe("1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/scan/scanApi.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write `frontend/src/scan/scanApi.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/scan/scanApi.test.ts`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/src/scan/scanApi.ts frontend/src/scan/scanApi.test.ts
git commit -m "feat(frontend): scan API wrappers with mapped errors"
```

---

### Task 9: Grade presentation helpers

**Files:**
- Create: `frontend/src/scan/grade.ts`
- Create: `frontend/src/scan/grade.test.ts`

- [ ] **Step 1: Write the failing test** in `frontend/src/scan/grade.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { gradeColor, gradeTone, barColor } from "./grade";

describe("grade presentation", () => {
  it("maps good grades to green and bad to red", () => {
    expect(gradeColor("A")).toBe("var(--green)");
    expect(gradeColor("E")).toBe("var(--red)");
  });
  it("gives a tone class per grade", () => {
    expect(gradeTone("A")).toBe("good");
    expect(gradeTone("C")).toBe("ok");
    expect(gradeTone("E")).toBe("bad");
  });
  it("colors bars by level and direction", () => {
    expect(barColor("high", true)).toBe("var(--red)");   // high & bad
    expect(barColor("high", false)).toBe("var(--green)"); // high & good (e.g. protein)
    expect(barColor("low", true)).toBe("var(--green)");   // low & bad-nutrient = good
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/scan/grade.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write `frontend/src/scan/grade.ts`**

```ts
import type { Grade, BarLevel } from "../api/types";

export type Tone = "good" | "ok" | "bad";

export function gradeTone(grade: Grade): Tone {
  if (grade === "A" || grade === "B") return "good";
  if (grade === "C") return "ok";
  return "bad";
}

export function gradeColor(grade: Grade): string {
  const tone = gradeTone(grade);
  if (tone === "good") return "var(--green)";
  if (tone === "ok") return "var(--amber)";
  return "var(--red)";
}

// For a nutrient bar: when the nutrient is bad-in-excess (high_is_bad), a high level
// is red and a low level is green; for good nutrients (protein/fibre) it's inverted.
export function barColor(level: BarLevel, highIsBad: boolean): string {
  const bad = highIsBad ? level === "high" : level === "low";
  const good = highIsBad ? level === "low" : level === "high";
  if (bad) return "var(--red)";
  if (good) return "var(--green)";
  return "var(--amber)";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/scan/grade.test.ts`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/src/scan/grade.ts frontend/src/scan/grade.test.ts
git commit -m "feat(frontend): grade and bar color helpers"
```

---

### Task 10: ScoreRing component

**Files:**
- Create: `frontend/src/components/ScoreRing.tsx`
- Create: `frontend/src/components/ScoreRing.module.css`
- Create: `frontend/src/components/ScoreRing.test.tsx`

- [ ] **Step 1: Write the failing test** in `frontend/src/components/ScoreRing.test.tsx`

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreRing } from "./ScoreRing";

describe("ScoreRing", () => {
  it("shows the grade letter and score number", () => {
    render(<ScoreRing grade="A" overall={84} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("84 / 100")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/components/ScoreRing.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Write `frontend/src/components/ScoreRing.module.css`**

```css
.wrap { display: flex; flex-direction: column; align-items: center; }
.ring {
  width: 128px; height: 128px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255, 255, 255, 0.14);
  border: 6px solid rgba(255, 255, 255, 0.85);
}
.grade { font-size: 56px; font-weight: 800; line-height: 1; color: #fff; }
.pill {
  margin-top: 10px; padding: 5px 16px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.18); border: 1px solid rgba(255, 255, 255, 0.3);
  font-size: 15px; font-weight: 800; color: #fff;
}
```

- [ ] **Step 4: Write `frontend/src/components/ScoreRing.tsx`**

```tsx
import type { Grade } from "../api/types";
import styles from "./ScoreRing.module.css";

export function ScoreRing({ grade, overall }: { grade: Grade; overall: number }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.ring}>
        <span className={styles.grade}>{grade}</span>
      </div>
      <div className={styles.pill}>{overall} / 100</div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/components/ScoreRing.test.tsx`
Expected: PASS (1 passed)

- [ ] **Step 6: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/src/components/ScoreRing.tsx frontend/src/components/ScoreRing.module.css frontend/src/components/ScoreRing.test.tsx
git commit -m "feat(frontend): ScoreRing component"
```

---

### Task 11: Breakdown component

**Files:**
- Create: `frontend/src/screens/Breakdown.tsx`
- Create: `frontend/src/screens/Breakdown.module.css`
- Create: `frontend/src/screens/Breakdown.test.tsx`

- [ ] **Step 1: Write the failing test** in `frontend/src/screens/Breakdown.test.tsx`

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breakdown } from "./Breakdown";
import type { Score } from "../api/types";

const score: Score = {
  overall: 52, grade: "C", verdict: "Okay sometimes", positives: [], negatives: [],
  breakdown: {
    nutrients: [
      { key: "sugars", label: "Sugar", value_g: 2.1, pct: 18, level: "low", high_is_bad: true },
      { key: "sat_fat", label: "Saturated fat", value_g: 11, pct: 74, level: "high", high_is_bad: true },
    ],
    india_flags: [{ label: "Palm oil", note: "Flagged for India market" }],
  },
};

describe("Breakdown", () => {
  it("renders each nutrient bar with its label and value", () => {
    render(<Breakdown score={score} />);
    expect(screen.getByText("Sugar")).toBeInTheDocument();
    expect(screen.getByText("Saturated fat")).toBeInTheDocument();
    expect(screen.getByText(/2.1\s*g/)).toBeInTheDocument();
  });

  it("renders India flags", () => {
    render(<Breakdown score={score} />);
    expect(screen.getByText("Palm oil")).toBeInTheDocument();
    expect(screen.getByText("Flagged for India market")).toBeInTheDocument();
  });

  it("omits the India flags section when there are none", () => {
    render(<Breakdown score={{ ...score, breakdown: { ...score.breakdown, india_flags: [] } }} />);
    expect(screen.queryByText(/India flags/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/screens/Breakdown.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Write `frontend/src/screens/Breakdown.module.css`**

```css
.section { margin-bottom: 20px; }
.secT {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--muted); margin: 0 0 10px;
}
.nut { margin-bottom: 12px; }
.nl { display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 600; margin-bottom: 5px; }
.nl .val { color: var(--muted); font-weight: 500; }
.bar { height: 7px; border-radius: 99px; background: var(--line); overflow: hidden; }
.bar > i { display: block; height: 100%; border-radius: 99px; }
.flag {
  display: flex; gap: 10px; align-items: flex-start;
  background: #fcefee; border: 1px solid #f6d7d3; border-radius: 13px;
  padding: 11px 13px; margin-bottom: 9px;
}
.flag .ic {
  width: 22px; height: 22px; border-radius: 7px; background: var(--red); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0;
}
.flag h4 { font-size: 12.5px; font-weight: 700; color: #9e2a22; }
.flag p { font-size: 10.5px; font-weight: 500; color: #b85047; margin-top: 1px; }
```

- [ ] **Step 4: Write `frontend/src/screens/Breakdown.tsx`**

```tsx
import type { Score } from "../api/types";
import { barColor } from "../scan/grade";
import styles from "./Breakdown.module.css";

export function Breakdown({ score }: { score: Score }) {
  const { nutrients, india_flags } = score.breakdown;
  return (
    <div>
      <div className={styles.section}>
        <p className={styles.secT}>Per 100g</p>
        {nutrients.map((n) => (
          <div className={styles.nut} key={n.key}>
            <div className={styles.nl}>
              <span>{n.label}</span>
              <span className={styles.val}>{n.value_g}g · {n.level}</span>
            </div>
            <div className={styles.bar}>
              <i style={{ width: `${n.pct}%`, background: barColor(n.level, n.high_is_bad) }} />
            </div>
          </div>
        ))}
      </div>

      {india_flags.length > 0 && (
        <div className={styles.section}>
          <p className={styles.secT}>India flags</p>
          {india_flags.map((f) => (
            <div className={styles.flag} key={f.label}>
              <div className={styles.ic}>!</div>
              <div>
                <h4>{f.label}</h4>
                <p>{f.note}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/screens/Breakdown.test.tsx`
Expected: PASS (3 passed)

- [ ] **Step 6: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/src/screens/Breakdown.tsx frontend/src/screens/Breakdown.module.css frontend/src/screens/Breakdown.test.tsx
git commit -m "feat(frontend): Breakdown component (nutrient bars + India flags)"
```

---

### Task 12: ResultScreen component

**Files:**
- Create: `frontend/src/screens/ResultScreen.tsx`
- Create: `frontend/src/screens/ResultScreen.module.css`
- Create: `frontend/src/screens/ResultScreen.test.tsx`

- [ ] **Step 1: Write the failing test** in `frontend/src/screens/ResultScreen.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultScreen } from "./ResultScreen";
import type { Product } from "../api/types";

const product: Product = {
  barcode: "1", name: "Roasted Chana", brand: "Tata", ingredients: ["chana"],
  nutrition: { energy_kj: 300, sugars_g: 2, sat_fat_g: 0.5, salt_g: 0.1, fibre_g: 5, protein_g: 9, fruit_veg_nuts_pct: 0 },
  source: "off",
  score: {
    overall: 84, grade: "A", verdict: "Good choice",
    positives: ["High protein"], negatives: [],
    breakdown: { nutrients: [{ key: "sugars", label: "Sugar", value_g: 2, pct: 18, level: "low", high_is_bad: true }], india_flags: [] },
  },
};

describe("ResultScreen", () => {
  it("shows verdict, score, product name, and reasons", () => {
    render(<ResultScreen product={product} onScanAgain={() => {}} />);
    expect(screen.getByText("Good choice")).toBeInTheDocument();
    expect(screen.getByText("84 / 100")).toBeInTheDocument();
    expect(screen.getByText("Roasted Chana")).toBeInTheDocument();
    expect(screen.getByText("High protein")).toBeInTheDocument();
  });

  it("toggles the breakdown open", async () => {
    render(<ResultScreen product={product} onScanAgain={() => {}} />);
    expect(screen.queryByText("Per 100g")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /breakdown/i }));
    expect(screen.getByText("Per 100g")).toBeInTheDocument();
  });

  it("calls onScanAgain when the scan-again button is clicked", async () => {
    const onScanAgain = vi.fn();
    render(<ResultScreen product={product} onScanAgain={onScanAgain} />);
    await userEvent.click(screen.getByRole("button", { name: /scan another/i }));
    expect(onScanAgain).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/screens/ResultScreen.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Write `frontend/src/screens/ResultScreen.module.css`**

```css
.screen { min-height: 100%; display: flex; flex-direction: column; padding-bottom: 24px; }
.hero { padding: 22px 22px 28px; border-radius: 0 0 32px 32px; text-align: center; color: #fff; }
.hero.good { background: linear-gradient(160deg, #1fa463, #0b3d2c); }
.hero.ok { background: linear-gradient(160deg, #f0a23b, #9a6212); }
.hero.bad { background: linear-gradient(160deg, #e2574c, #7e1e18); }
.verdict { font-size: 20px; font-weight: 800; margin-top: 14px; }
.sub { font-size: 13px; font-weight: 600; opacity: 0.9; margin-top: 2px; }
.prod {
  display: flex; align-items: center; gap: 12px; background: var(--card);
  margin: -18px 18px 0; padding: 14px; border-radius: 18px;
  box-shadow: 0 14px 30px -18px rgba(0, 0, 0, 0.25); position: relative; z-index: 5;
}
.prod h3 { font-size: 14px; font-weight: 700; }
.prod p { font-size: 11px; color: var(--muted); margin-top: 2px; }
.reasons { padding: 18px; display: flex; flex-direction: column; gap: 9px; }
.reason {
  display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600;
  padding: 11px 13px; border-radius: 13px; background: var(--card); border: 1px solid var(--line);
}
.reason .ic { width: 24px; height: 24px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; }
.reason.pos .ic { background: #e4f6ea; color: var(--green); }
.reason.neg .ic { background: #fce7e5; color: var(--red); }
.toggle {
  margin: 4px 18px 0; text-align: center; font-size: 12px; font-weight: 700; color: var(--green);
  padding: 13px; border-radius: 14px; border: 1.5px dashed #cde3d4; background: transparent; width: calc(100% - 36px);
}
.detail { padding: 8px 18px 0; }
.again {
  margin: 18px 18px 0; padding: 15px; border-radius: 16px; background: var(--green-deep);
  color: #fff; font-weight: 700; font-size: 14px;
}
```

- [ ] **Step 4: Write `frontend/src/screens/ResultScreen.tsx`**

```tsx
import { useState } from "react";
import type { Product } from "../api/types";
import { gradeTone } from "../scan/grade";
import { ScoreRing } from "../components/ScoreRing";
import { Breakdown } from "./Breakdown";
import styles from "./ResultScreen.module.css";

export function ResultScreen({ product, onScanAgain }: { product: Product; onScanAgain: () => void }) {
  const [open, setOpen] = useState(false);
  const { score } = product;
  const tone = gradeTone(score.grade);

  return (
    <div className={styles.screen}>
      <div className={`${styles.hero} ${styles[tone]}`}>
        <ScoreRing grade={score.grade} overall={score.overall} />
        <div className={styles.verdict}>{score.verdict}</div>
        <div className={styles.sub}>{product.source === "db" ? "From your scans" : "Freshly scored"}</div>
      </div>

      <div className={styles.prod}>
        <div>
          <h3>{product.name || "Unknown product"}</h3>
          <p>{product.brand || product.barcode}</p>
        </div>
      </div>

      <div className={styles.reasons}>
        {score.positives.map((p) => (
          <div className={`${styles.reason} ${styles.pos}`} key={`p-${p}`}>
            <div className={styles.ic}>✓</div>
            <span>{p}</span>
          </div>
        ))}
        {score.negatives.map((n) => (
          <div className={`${styles.reason} ${styles.neg}`} key={`n-${n}`}>
            <div className={styles.ic}>!</div>
            <span>{n}</span>
          </div>
        ))}
      </div>

      <button className={styles.toggle} onClick={() => setOpen((v) => !v)}>
        {open ? "▴ Hide breakdown" : "▾ See full breakdown"}
      </button>
      {open && (
        <div className={styles.detail}>
          <Breakdown score={score} />
        </div>
      )}

      <button className={styles.again} onClick={onScanAgain}>Scan another</button>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/screens/ResultScreen.test.tsx`
Expected: PASS (3 passed)

- [ ] **Step 6: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/src/screens/ResultScreen.tsx frontend/src/screens/ResultScreen.module.css frontend/src/screens/ResultScreen.test.tsx
git commit -m "feat(frontend): ResultScreen with verdict, reasons, expandable breakdown"
```

---

### Task 13: AuthScreen component

**Files:**
- Create: `frontend/src/screens/AuthScreen.tsx`
- Create: `frontend/src/screens/AuthScreen.module.css`
- Create: `frontend/src/screens/AuthScreen.test.tsx`

- [ ] **Step 1: Write the failing test** in `frontend/src/screens/AuthScreen.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthScreen } from "./AuthScreen";

describe("AuthScreen", () => {
  it("continues as guest", async () => {
    const onGuest = vi.fn().mockResolvedValue(undefined);
    render(<AuthScreen onGuest={onGuest} onEmailLogin={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /guest/i }));
    expect(onGuest).toHaveBeenCalledOnce();
  });

  it("submits a valid email", async () => {
    const onEmailLogin = vi.fn().mockResolvedValue(undefined);
    render(<AuthScreen onGuest={vi.fn()} onEmailLogin={onEmailLogin} />);
    await userEvent.type(screen.getByPlaceholderText(/email/i), "a@b.com");
    await userEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    expect(onEmailLogin).toHaveBeenCalledWith("a@b.com");
  });

  it("blocks an invalid email and shows a message", async () => {
    const onEmailLogin = vi.fn();
    render(<AuthScreen onGuest={vi.fn()} onEmailLogin={onEmailLogin} />);
    await userEvent.type(screen.getByPlaceholderText(/email/i), "nope");
    await userEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    expect(onEmailLogin).not.toHaveBeenCalled();
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
  });

  it("shows an error when login fails", async () => {
    const onEmailLogin = vi.fn().mockRejectedValue(new Error("boom"));
    render(<AuthScreen onGuest={vi.fn()} onEmailLogin={onEmailLogin} />);
    await userEvent.type(screen.getByPlaceholderText(/email/i), "a@b.com");
    await userEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    expect(await screen.findByText(/couldn't sign you in/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/screens/AuthScreen.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Write `frontend/src/screens/AuthScreen.module.css`**

```css
.screen { min-height: 100%; display: flex; flex-direction: column; justify-content: flex-end;
  background: linear-gradient(180deg, #10211a 0%, #0e1311 100%); color: #fff; }
.top { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 30px; }
.mark { width: 72px; height: 72px; border-radius: 22px; background: var(--lime); color: #10211a;
  display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 800; margin-bottom: 22px; }
.top h1 { font-size: 25px; font-weight: 800; line-height: 1.2; margin-bottom: 10px; }
.top p { color: #9aa89c; font-size: 13.5px; max-width: 240px; line-height: 1.6; }
.sheet { background: var(--card); color: var(--ink); border-radius: 30px 30px 0 0; padding: 24px 22px 26px;
  display: flex; flex-direction: column; gap: 10px; }
.input { border: 1px solid var(--line); border-radius: 15px; padding: 14px; font-size: 14px; font-family: inherit; }
.btn { border-radius: 15px; padding: 14px; font-weight: 700; font-size: 14px; }
.btn.dark { background: var(--ink); color: #fff; }
.btn.lime { background: var(--lime); color: #10211a; }
.guest { background: transparent; text-align: center; font-size: 12.5px; font-weight: 600; color: var(--muted); padding: 8px; }
.guest b { color: var(--green); }
.note { font-size: 10.5px; text-align: center; color: #a9b3a8; margin-top: 2px; }
.err { font-size: 12px; color: var(--red); text-align: center; font-weight: 600; }
```

- [ ] **Step 4: Write `frontend/src/screens/AuthScreen.tsx`**

```tsx
import { useState } from "react";
import styles from "./AuthScreen.module.css";

interface Props {
  onGuest: () => Promise<void> | void;
  onEmailLogin: (email: string) => Promise<void> | void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthScreen({ onGuest, onEmailLogin }: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitEmail = async () => {
    if (!EMAIL_RE.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onEmailLogin(email);
    } catch {
      setError("We couldn't sign you in. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const doGuest = async () => {
    setError(null);
    setBusy(true);
    try {
      await onGuest();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <div className={styles.mark}>P</div>
        <h1>Know what's<br />in your food.</h1>
        <p>Scan, get a clear score, shop smarter. No spreadsheets, no guilt.</p>
      </div>
      <div className={styles.sheet}>
        <input
          className={styles.input}
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <button className={`${styles.btn} ${styles.dark}`} disabled={busy} onClick={submitEmail}>
          Continue with email
        </button>
        <button className={styles.guest} disabled={busy} onClick={doGuest}>
          Just looking? <b>Continue as guest →</b>
        </button>
        {error && <div className={styles.err}>{error}</div>}
        <div className={styles.note}>Guest: 3 scans/day · Free account: 10 scans/day</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/screens/AuthScreen.test.tsx`
Expected: PASS (4 passed)

- [ ] **Step 6: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/src/screens/AuthScreen.tsx frontend/src/screens/AuthScreen.module.css frontend/src/screens/AuthScreen.test.tsx
git commit -m "feat(frontend): AuthScreen (guest + email login)"
```

---

### Task 14: Barcode scanner hook

**Files:**
- Create: `frontend/src/scan/useBarcodeScanner.ts`
- Create: `frontend/src/scan/useBarcodeScanner.test.tsx`

> The hook wraps `@zxing/browser`'s `BrowserMultiFormatReader`. To keep it testable
> without a real camera, the ZXing reader is injectable via an optional factory
> argument; production code uses the default factory.

- [ ] **Step 1: Write the failing test** in `frontend/src/scan/useBarcodeScanner.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { useBarcodeScanner, type ZxingReader } from "./useBarcodeScanner";

function makeFakeReader(textToEmit: string | null): ZxingReader {
  return {
    decodeFromVideoDevice: (_deviceId, _video, cb) => {
      if (textToEmit) cb({ getText: () => textToEmit }, undefined);
      return Promise.resolve({ stop: () => {} });
    },
  };
}

function Harness({ reader, onScan }: { reader: ZxingReader; onScan: (s: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { error } = useBarcodeScanner({ videoRef, enabled: true, onScan, makeReader: () => reader });
  return (
    <div>
      <video ref={videoRef} />
      <span data-testid="error">{error ?? "none"}</span>
    </div>
  );
}

describe("useBarcodeScanner", () => {
  it("invokes onScan with the decoded barcode text", async () => {
    const onScan = vi.fn();
    render(<Harness reader={makeFakeReader("8901058000177")} onScan={onScan} />);
    await waitFor(() => expect(onScan).toHaveBeenCalledWith("8901058000177"));
  });

  it("does not call onScan when nothing decodes", async () => {
    const onScan = vi.fn();
    render(<Harness reader={makeFakeReader(null)} onScan={onScan} />);
    // give effects a tick
    await new Promise((r) => setTimeout(r, 20));
    expect(onScan).not.toHaveBeenCalled();
    expect(screen.getByTestId("error").textContent).toBe("none");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/scan/useBarcodeScanner.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Write `frontend/src/scan/useBarcodeScanner.ts`**

```ts
import { useEffect, useState, type RefObject } from "react";

// Minimal structural type for the ZXing reader so we can inject a fake in tests.
export interface ZxingResultLike {
  getText(): string;
}
export interface ZxingControls {
  stop(): void;
}
export interface ZxingReader {
  decodeFromVideoDevice(
    deviceId: string | undefined,
    video: HTMLVideoElement,
    callback: (result: ZxingResultLike | undefined, err: unknown) => void,
  ): Promise<ZxingControls>;
}

interface Options {
  videoRef: RefObject<HTMLVideoElement>;
  enabled: boolean;
  onScan: (barcode: string) => void;
  makeReader?: () => ZxingReader;
}

async function defaultReader(): Promise<ZxingReader> {
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  return new BrowserMultiFormatReader() as unknown as ZxingReader;
}

export function useBarcodeScanner({ videoRef, enabled, onScan, makeReader }: Options) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !videoRef.current) return;
    let controls: ZxingControls | null = null;
    let cancelled = false;

    const start = async () => {
      try {
        const reader = makeReader ? makeReader() : await defaultReader();
        if (cancelled || !videoRef.current) return;
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result) onScan(result.getText());
        });
      } catch {
        setError("Camera unavailable. You can still photograph the label.");
      }
    };
    void start();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [enabled, videoRef, onScan, makeReader]);

  return { error };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/scan/useBarcodeScanner.test.tsx`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/src/scan/useBarcodeScanner.ts frontend/src/scan/useBarcodeScanner.test.tsx
git commit -m "feat(frontend): injectable @zxing barcode scanner hook"
```

---

### Task 15: ScanScreen (camera + photo fallback)

**Files:**
- Create: `frontend/src/screens/ScanScreen.tsx`
- Create: `frontend/src/screens/ScanScreen.module.css`
- Create: `frontend/src/screens/ScanScreen.test.tsx`

> ScanScreen owns the scan workflow state. To keep it unit-testable without a camera,
> it accepts injectable `scan` functions (defaulting to the real scanApi) and renders
> the barcode hook only when a video element is present. The tests drive it via the
> injected functions and the manual entry + photo controls.

- [ ] **Step 1: Write the failing test** in `frontend/src/screens/ScanScreen.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScanScreen } from "./ScanScreen";
import { NeedsPhotoError, RateLimitError } from "../scan/scanApi";
import type { ScanResult } from "../api/types";

const RESULT: ScanResult = {
  source: "off", remaining: 2,
  product: { barcode: "1", name: "Chana", brand: "Tata", ingredients: [], source: "off",
    nutrition: { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0, fruit_veg_nuts_pct: 0 },
    score: { overall: 84, grade: "A", verdict: "Good choice", positives: [], negatives: [], breakdown: { nutrients: [], india_flags: [] } } },
};

function setup(overrides = {}) {
  const props = {
    token: "tok",
    onResult: vi.fn(),
    scanByBarcode: vi.fn().mockResolvedValue(RESULT),
    scanByPhoto: vi.fn().mockResolvedValue(RESULT),
    ...overrides,
  };
  render(<ScanScreen {...props} />);
  return props;
}

describe("ScanScreen", () => {
  it("scans a manually entered barcode and reports the result", async () => {
    const props = setup();
    await userEvent.type(screen.getByPlaceholderText(/enter barcode/i), "8901058000177");
    await userEvent.click(screen.getByRole("button", { name: /^look up$/i }));
    expect(props.scanByBarcode).toHaveBeenCalledWith("8901058000177", "tok");
    expect(props.onResult).toHaveBeenCalledWith(RESULT);
  });

  it("prompts for a photo when the barcode is unknown", async () => {
    const props = setup({ scanByBarcode: vi.fn().mockRejectedValue(new NeedsPhotoError()) });
    await userEvent.type(screen.getByPlaceholderText(/enter barcode/i), "999");
    await userEvent.click(screen.getByRole("button", { name: /^look up$/i }));
    expect(await screen.findByText(/take a photo of the label/i)).toBeInTheDocument();
    expect(props.onResult).not.toHaveBeenCalled();
  });

  it("uploads a label photo and reports the result", async () => {
    const props = setup({ scanByBarcode: vi.fn().mockRejectedValue(new NeedsPhotoError()) });
    await userEvent.type(screen.getByPlaceholderText(/enter barcode/i), "999");
    await userEvent.click(screen.getByRole("button", { name: /^look up$/i }));
    const file = new File([new Uint8Array([1, 2, 3])], "label.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByTestId("photo-input"), file);
    expect(props.scanByPhoto).toHaveBeenCalled();
    expect(props.onResult).toHaveBeenCalledWith(RESULT);
  });

  it("shows a limit message on rate limit", async () => {
    setup({ scanByBarcode: vi.fn().mockRejectedValue(new RateLimitError()) });
    await userEvent.type(screen.getByPlaceholderText(/enter barcode/i), "1");
    await userEvent.click(screen.getByRole("button", { name: /^look up$/i }));
    expect(await screen.findByText(/daily scan limit/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/screens/ScanScreen.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Write `frontend/src/screens/ScanScreen.module.css`**

```css
.screen { min-height: 100%; display: flex; flex-direction: column;
  background: linear-gradient(180deg, #0e1311 0%, #10211a 100%); color: #fff; }
.bar { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px 6px; }
.logo { font-weight: 800; font-size: 17px; }
.logo b { color: var(--lime); }
.pill { font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 999px; background: rgba(255,255,255,0.1); color: var(--lime); }
.viewfinder { flex: 1; margin: 14px 20px; border-radius: 28px; overflow: hidden; position: relative;
  background: #16201b; display: flex; align-items: center; justify-content: center; min-height: 260px; }
.viewfinder video { width: 100%; height: 100%; object-fit: cover; }
.frame { position: absolute; width: 190px; height: 130px; border: 3px solid var(--lime); border-radius: 18px; opacity: 0.9; }
.hint { position: absolute; bottom: 16px; left: 0; right: 0; text-align: center; font-size: 12px; color: rgba(255,255,255,0.7); }
.actions { padding: 6px 20px 18px; display: flex; flex-direction: column; gap: 10px; }
.row { display: flex; gap: 8px; }
.input { flex: 1; border-radius: 14px; padding: 13px; font-size: 14px; font-family: inherit; border: 0; }
.btn { border-radius: 14px; padding: 13px 16px; font-weight: 700; font-size: 14px; }
.btn.lime { background: var(--lime); color: #10211a; }
.btn.ghost { background: rgba(255,255,255,0.1); color: #fff; }
.photoPrompt { background: rgba(255,255,255,0.08); border-radius: 16px; padding: 14px; text-align: center; font-size: 13px; }
.err { color: #ffd2cd; font-size: 13px; text-align: center; font-weight: 600; }
.busy { text-align: center; font-size: 13px; color: rgba(255,255,255,0.8); }
.hidden { display: none; }
```

- [ ] **Step 4: Write `frontend/src/screens/ScanScreen.tsx`**

```tsx
import { useRef, useState } from "react";
import type { ScanResult } from "../api/types";
import {
  scanBarcode as defaultScanBarcode,
  scanPhoto as defaultScanPhoto,
  NeedsPhotoError,
  RateLimitError,
  UnreadableLabelError,
} from "../scan/scanApi";
import { useBarcodeScanner } from "../scan/useBarcodeScanner";
import styles from "./ScanScreen.module.css";

interface Props {
  token: string;
  remaining?: number;
  onResult: (r: ScanResult) => void;
  scanByBarcode?: (barcode: string, token: string) => Promise<ScanResult>;
  scanByPhoto?: (barcode: string, image: Blob, token: string) => Promise<ScanResult>;
}

export function ScanScreen({
  token, remaining, onResult,
  scanByBarcode = defaultScanBarcode,
  scanByPhoto = defaultScanPhoto,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState("");
  const [needsPhoto, setNeedsPhoto] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleError = (e: unknown) => {
    if (e instanceof NeedsPhotoError) {
      setNeedsPhoto(true);
      setError(null);
    } else if (e instanceof RateLimitError) {
      setError("You've hit your daily scan limit. Sign in or come back tomorrow.");
    } else if (e instanceof UnreadableLabelError) {
      setError("We couldn't read that label. Try a clearer photo of the nutrition panel.");
    } else {
      setError("Something went wrong. Please try again.");
    }
  };

  const runBarcode = async (barcode: string) => {
    if (!barcode || busy) return;
    setBusy(true);
    setError(null);
    setPendingBarcode(barcode);
    try {
      onResult(await scanByBarcode(barcode, token));
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const onPhotoPicked = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      onResult(await scanByPhoto(pendingBarcode ?? manual ?? "unknown", file, token));
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  useBarcodeScanner({
    videoRef,
    enabled: !needsPhoto,
    onScan: (code) => void runBarcode(code),
  });

  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <div className={styles.logo}>Par<b>akh</b></div>
        {remaining !== undefined && <div className={styles.pill}>{remaining} scans left today</div>}
      </div>

      <div className={styles.viewfinder}>
        <video ref={videoRef} muted playsInline />
        <div className={styles.frame} />
        <div className={styles.hint}>Line up the barcode to scan</div>
      </div>

      <div className={styles.actions}>
        {busy && <div className={styles.busy}>Scanning…</div>}
        {error && <div className={styles.err}>{error}</div>}

        {needsPhoto ? (
          <div className={styles.photoPrompt}>
            We don't know this product yet — take a photo of the label and we'll read it.
            <label className={`${styles.btn} ${styles.lime}`} style={{ display: "block", marginTop: 10 }}>
              📷 Take a photo of the label
              <input
                data-testid="photo-input"
                className={styles.hidden}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => onPhotoPicked(e.target.files?.[0])}
              />
            </label>
          </div>
        ) : (
          <>
            <div className={styles.row}>
              <input
                className={styles.input}
                placeholder="Enter barcode"
                value={manual}
                inputMode="numeric"
                onChange={(e) => setManual(e.target.value)}
              />
              <button className={`${styles.btn} ${styles.lime}`} onClick={() => runBarcode(manual)}>
                Look up
              </button>
            </div>
            <label className={`${styles.btn} ${styles.ghost}`} style={{ textAlign: "center" }}>
              📷 Photograph the label instead
              <input
                data-testid="photo-input"
                className={styles.hidden}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => onPhotoPicked(e.target.files?.[0])}
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/screens/ScanScreen.test.tsx`
Expected: PASS (4 passed)

- [ ] **Step 6: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/src/screens/ScanScreen.tsx frontend/src/screens/ScanScreen.module.css frontend/src/screens/ScanScreen.test.tsx
git commit -m "feat(frontend): ScanScreen with camera, manual entry, photo fallback"
```

---

### Task 16: App shell wiring

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/App.test.tsx`

- [ ] **Step 1: Write the failing test** in `frontend/src/App.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("App", () => {
  it("shows the auth screen when there is no session", () => {
    render(<App />);
    expect(screen.getByText(/in your food/i)).toBeInTheDocument();
  });

  it("after guest login, shows the scan screen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "g" }) }));
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /guest/i }));
    expect(await screen.findByPlaceholderText(/enter barcode/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/App.test.tsx`
Expected: FAIL (current App renders only "Parakh")

- [ ] **Step 3: Write `frontend/src/App.tsx`**

```tsx
import { useState } from "react";
import { SessionProvider, useSession } from "./session/SessionContext";
import { AuthScreen } from "./screens/AuthScreen";
import { ScanScreen } from "./screens/ScanScreen";
import { ResultScreen } from "./screens/ResultScreen";
import type { ScanResult } from "./api/types";

function Shell() {
  const { token, guest, login } = useSession();
  const [result, setResult] = useState<ScanResult | null>(null);

  if (!token) {
    return <AuthScreen onGuest={guest} onEmailLogin={login} />;
  }

  if (result) {
    return <ResultScreen product={result.product} onScanAgain={() => setResult(null)} />;
  }

  return (
    <ScanScreen
      token={token}
      remaining={result ? (result as ScanResult).remaining : undefined}
      onResult={setResult}
    />
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npx vitest run src/App.test.tsx`
Expected: PASS (2 passed)

- [ ] **Step 5: Run the full frontend suite**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npm test`
Expected: all tests pass across every spec file.

- [ ] **Step 6: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat(frontend): app shell wiring (auth -> scan -> result)"
```

---

### Task 17: Type-check, production build, and README

**Files:**
- Create: `frontend/README.md`

- [ ] **Step 1: Write `frontend/README.md`**

````markdown
# Parakh Frontend (PWA)

React + TypeScript (Vite) mobile-first PWA. Scan a barcode or photograph a food
label and get a single A–E / 0–100 health score.

## Setup

```bash
cd frontend
npm install
cp .env.example .env   # leave VITE_API_BASE_URL empty to use the dev proxy
```

## Run (with the backend)

In one terminal, start the backend (see `backend/README.md`) on port 8000.
In another:

```bash
cd frontend
npm run dev
```

Vite proxies `/auth`, `/scan`, `/health` to `http://localhost:8000`. Open the
printed URL on your phone (same network) or a desktop browser. Camera access
requires `https://` or `localhost`.

## Test

```bash
npm test
```

## Build

```bash
npm run build && npm run preview
```
````

- [ ] **Step 2: Run the type-check and build**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npm run build`
Expected: `tsc -b` reports no type errors and Vite produces a `dist/` bundle with no errors.

- [ ] **Step 3: Run the full test suite once more**

Run: `cd /Users/rsumit123/work/nutri-content/frontend && npm test`
Expected: all tests green.

- [ ] **Step 4: Commit**

```bash
cd /Users/rsumit123/work/nutri-content
git add frontend/README.md
git commit -m "docs(frontend): README with setup, run, build"
```

---

## Self-Review (completed during authoring)

**Spec coverage:**
- PWA, mobile-first, installable → Task 1 (vite-plugin-pwa, manifest, icons).
- Approved look (deep-green+lime, Plus Jakarta Sans, verdict-first) → Tasks 2, 10, 12, 13, 15.
- Barcode scan → Tasks 14, 15 (`@zxing/browser`, per the chosen library).
- Label-photo fallback → Task 15 (`scan/photo` multipart on `NeedsPhotoError`).
- Single overall score + expandable breakdown → Tasks 10, 11, 12.
- Guest + email accounts and limits shown → Tasks 5, 6, 7, 13 (both in v1, per decision).
- Daily-limit handling (429) → Tasks 8, 15.
- Error states (unknown product 404, unreadable label 422) → Tasks 8, 15.
- Talks to the locked backend contract → Tasks 3, 4, 8 (types + client + wrappers mirror the API exactly).

**Backend pairing:** consumes only the endpoints/shapes the merged backend exposes; `apiUrl` + Vite proxy handle CORS/base-url; the score object includes `verdict/positives/negatives` (the fields fixed in the backend before merge).

**Placeholder scan:** none.

**Type consistency:** `ScanResult`/`Product`/`Score`/`NutrientBar` (Task 3) are used unchanged across client, scanApi, and every component. `scanBarcode(barcode, token)` / `scanPhoto(barcode, image, token)` signatures match between Task 8 and Task 15. `gradeTone`/`barColor` (Task 9) are used as defined in Tasks 11 and 12. Error classes `NeedsPhotoError`/`RateLimitError`/`UnreadableLabelError` are defined once (Task 8) and consumed in Task 15.

**Known follow-ups (out of scope, intentional):** History and Profile tabs are shown in the mockup but the plan ships the core Scan→Result→Auth loop first; a TabBar component file is listed in the structure but wiring multiple tabs is a deliberate v2 step. The `remaining` count surfaced on ScanScreen is wired from results in a later iteration (the prop is supported now).
