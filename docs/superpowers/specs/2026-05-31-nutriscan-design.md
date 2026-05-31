# NutriScan — Design Spec

**Date:** 2026-05-31
**Status:** Approved (design), pending implementation plan

## 1. Summary

NutriScan is a mobile-first Progressive Web App that lets a user scan a packaged
food product and instantly see a single, clear "good for you / bad for you"
verdict. The user scans the product barcode; if the product is known, they get an
instant cached score. If it is unknown, the user photographs the nutrition/
ingredients label, a cheap vision model extracts the data, and the product is
scored and cached forever. The scoring is a deterministic formula (Nutri-Score +
India-specific penalties), so the same product always gets the same score and the
result is fully explainable.

Target audience: Gen Z and millennial Indian consumers who want to understand
packaged food without reading labels themselves. Aesthetic: clean, modern,
sophisticated, mobile-first.

## 2. Goals

- Scan a barcode and return a health verdict in seconds for known products.
- Handle unknown products via label-photo OCR/extraction, with no external DB dependency.
- Show one clear overall score (0–100 + A–E letter + color) with an optional detailed breakdown.
- Grow a product database automatically: every unknown product scanned once becomes a cached lookup forever.
- Support guest and free logged-in users with daily scan limits.

## 3. Non-Goals (this phase)

- Paid tiers / billing (designed for, but not built yet).
- Native Android / iOS apps (PWA only for now).
- Product reformulation tracking / "last verified" re-scan flow (v2).
- Personalized scoring based on user health conditions (e.g. diabetic-specific) — future.
- Social features, sharing, recommendations.

## 4. Core User Flows

### 4.1 Scan flow (the caching flywheel)

1. **Auth + rate-limit check.** Identify the user (guest or logged-in) and check
   their remaining daily scans. Block with an upgrade prompt if exhausted.
2. **Barcode lookup in our DB.** Scan barcode in-browser → query our SQLite
   `products` table.
   - **Hit** → return the cached score instantly. ⚡
3. **OpenFoodFacts fallback.** On miss, query the OpenFoodFacts API.
   - **Has usable data** → run scoring → write product to our DB → return score.
4. **Label-photo fallback.** Still no data → prompt the user to photograph the
   label. A cheap vision model (via OpenRouter) extracts structured ingredients +
   nutrition → run scoring → write product to our DB → return score.

Result: the first scanner of an unknown product "pays" the extraction cost; every
later scan of that product is an instant DB lookup. The database grows and gets
cheaper over time.

### 4.2 Account flow

- **Guest:** can use the app immediately. 3 scans/day. Tracked by a device ID
  stored on-device + IP. (Soft limit — a speed bump against casual abuse, not a
  hard wall; clearing storage can reset it. This is acceptable.)
- **Free logged-in user:** sign in with Google or email. 10 scans/day. Limit is
  enforced server-side (hard). Gets scan history.
- **Paid user:** higher limit — designed for, not implemented this phase.

## 5. Architecture

```
PWA (React + TypeScript, Vite)
  • In-browser barcode scanner (camera)
  • Label photo capture
  • Score + breakdown UI, history, auth
        │ HTTPS (REST/JSON)
        ▼
FastAPI backend (Python, long-running server w/ persistent disk)
  1. Auth + rate-limit (guest tier / free tier)
  2. Barcode → our DB lookup
  3. OpenFoodFacts fallback
  4. Label photo → vision extraction (OpenRouter) → structured data
  5. Scoring (pure function) → cache result
        │                         │
        ▼                         ▼
   SQLite (disk)            OpenRouter (vision model)
   products / users /       cheap, swappable:
   daily_scans             Gemini Flash / Qwen2.5-VL to start
        │
        ▼
   OpenFoodFacts API (free, open product data)
```

### 5.1 Stack decisions & rationale

- **Frontend: React + TypeScript (Vite), installable PWA.** One codebase that runs
  on Android and iOS via the browser; camera access for scanning and photos.
- **Backend: FastAPI (Python).** The app's real work is backend orchestration
  (vision calls, OpenFoodFacts, scoring, rate-limiting), which Python handles
  cleanly. A long-running server also suits SQLite.
- **Database: SQLite.** Chosen for simplicity in early phases. **Important
  constraint:** SQLite needs a persistent filesystem, so the backend must be
  deployed on a host with a durable disk (e.g. Railway/Render/Fly), **not** an
  ephemeral serverless platform. Migration path to Postgres exists if scale
  demands it.
- **Barcode data: OpenFoodFacts API** — free, open, growing Indian coverage.
- **Label reading: a cheap vision model via OpenRouter**, configured as an env
  value (not hardcoded). Behind a single `extract_label()` function that forces
  structured JSON output, so models are interchangeable. Start with the cheapest
  acceptable option (e.g. Gemini Flash / Qwen2.5-VL); upgrade only if extraction
  quality is poor.
- **Scoring: a pure Python function** implementing Nutri-Score + India penalties.
  No AI in the scoring step → consistent, defensible scores.

## 6. Components & Interfaces

Each unit has one clear purpose and a well-defined interface:

- **`scanner` (frontend):** owns the camera, decodes barcodes, captures label
  photos. Output: a barcode string or an image blob.
- **`api client` (frontend):** talks to the backend; handles auth tokens and
  rate-limit responses.
- **`result UI` (frontend):** renders the verdict (ring + grade + score pill +
  flags) and the expandable breakdown.
- **`auth` (backend):** identifies guest vs logged-in, issues/validates sessions.
- **`rate_limiter` (backend):** given an identity + tier, checks and decrements
  the daily scan allowance. Interface: `check_and_consume(identity) -> allowed/remaining`.
- **`product_repository` (backend):** read/write products in SQLite, keyed by
  barcode. Interface: `get(barcode)`, `save(product)`.
- **`openfoodfacts_client` (backend):** `fetch(barcode) -> raw product data | None`.
- **`label_extractor` (backend):** `extract_label(image) -> {ingredients[], nutrition{}}`
  via OpenRouter; model name from config.
- **`scorer` (backend):** pure function `score(ingredients, nutrition) ->
  {overall 0–100, grade A–E, breakdown}`. Implements Nutri-Score + India penalties.

This separation means the scoring logic, the extraction model, and the data
sources can each change without touching the others.

## 7. Data Model (SQLite, initial)

- **`products`** — `barcode` (PK), `name`, `brand`, `ingredients` (JSON),
  `nutrition` (JSON), `score_overall`, `score_grade`, `score_breakdown` (JSON),
  `source` (db/off/photo), `created_at`.
- **`users`** — `id` (PK), `email`, `auth_provider`, `tier`, `created_at`.
- **`daily_scans`** — tracks scan counts per identity (user id or guest device id)
  per day, for rate-limiting. e.g. `identity`, `date`, `count`.

## 8. Scoring Model

- **Backbone:** the published Nutri-Score algorithm — negative points for energy,
  sugar, saturated fat, salt; positive points for fibre, protein, fruit/veg/nuts.
  Yields an overall score mapped to an A–E grade and 0–100 number.
- **India-specific penalties layered on top:** flag and down-weight palm oil,
  refined flour (maida), and excessive additives/flavour enhancers common in
  Indian packaged snacks.
- **Output:** one overall 0–100 score + A–E letter + color, plus a structured
  breakdown (per-nutrient bars + India flags) for the expandable detail view.
- **Principle:** AI only *extracts* data; the formula *scores*. Deterministic and
  explainable.

## 9. UI / Look & Feel (approved mockup)

Aesthetic approved via high-fidelity mockup: clean, rounded, "Plus Jakarta Sans"
type, deep-green + lime accent palette, mobile-first.

Key screens:
- **Scan (home):** barcode viewfinder with lime scan-frame, "N scans left today"
  pill, "take a photo of the label" + "search by name" fallbacks, bottom tab bar
  (Scan / History / Profile).
- **Result:** large verdict-first hero — grade letter in a ring, score in a pill
  below the verdict ("Good choice" / "Best avoided"), product card, top 2–3
  reason flags, "see full breakdown". Green for good, red for bad, same layout.
- **Breakdown:** per-nutrient bars (sugar, sat-fat, salt, fibre, protein) + India
  flags section.
- **Sign in / guest:** Google + email auth, "continue as guest", with guest 3/day
  vs free 10/day limits shown.

## 10. Error Handling

- **Barcode not decodable** → guide user to retry or switch to label photo.
- **Product not in our DB and not in OpenFoodFacts** → prompt label photo.
- **Label photo unreadable / extraction low-confidence** → ask user to retake
  (better lighting / focus on the nutrition panel). Do not cache a low-confidence
  result.
- **Vision/API failures (OpenRouter, OpenFoodFacts)** → graceful message, do not
  consume the user's scan allowance on a failed scan.
- **Rate limit exhausted** → clear message + sign-in/upgrade prompt (guest → free).

## 11. Testing Strategy

- **`scorer`:** unit tests with known products and expected grades (the most
  important tests — the formula is the product's credibility). Include
  India-penalty cases (palm oil, maida).
- **`rate_limiter`:** unit tests for guest vs free limits, day rollover, exhaustion.
- **`label_extractor`:** tests against a fixed set of sample label images →
  expected structured output (model behind an interface so it can be mocked).
- **`product_repository` / DB:** read/write/caching round-trips.
- **Scan flow:** integration tests covering the 4 fallback branches (DB hit → OFF
  hit → photo → not found).
- **Frontend:** component tests for the result/breakdown rendering across grades.

## 12. Open Questions / Future

- Which exact OpenRouter vision model wins on cost vs accuracy — decide empirically
  during implementation with sample Indian labels.
- Product reformulation: add `last_verified` + re-scan flow (v2).
- Paid tier limits and billing (future phase).
- Personalized scoring for health conditions (future).
