# Unified Scan + QR Loader — Design Spec

**Date:** 2026-06-02
**Status:** Approved (design), pending implementation plan

## Goal

Consolidate the Home screen's three scan cards into **one "Scan a product" button**, move label-upload and manual-barcode entry **into the camera screen**, and replace the spinner loader with an on-brand **QR-scan animation** ("Parakhing your food…").

## Why

Three cards (Scan barcode / Upload label / Enter barcode) is choice-paralysis; the mental model should be "point at the pack, we figure it out." The camera screen already does barcode→label fallback, so Home only needs one entry point. A QR/scan-line loader reads as "analysing" and fits the dark/lime brand better than a generic spinner.

## Scope (frontend only; no backend/API change)

**HomeScreen** (`src/screens/HomeScreen.tsx` + tests):
- Replace the three action cards + hidden file input + manual-barcode UI with a single primary **"Scan a product"** button → `onOpenCamera`, guarded by quota (if `remaining === 0`, open `LimitModal` instead).
- Keep `RecentScans` and `LimitModal`.
- HomeScreen no longer scans, so drop `useScan`, `LoadingOverlay`, `runPhoto`, `runBarcode`, the file input, and the manual UI. Slim props to: `remaining?`, `isGuest`, `history`, `onOpenCamera`, `onOpenProduct`, `onSeeHistory`, `onSignIn`. (Removes `token`, `onResult`, `onAuthError`, `scanByBarcode`, `scanByPhoto`.)

**ScanScreen** (`src/screens/ScanScreen.tsx` + tests):
- Keep the live barcode scanner, the barcode-not-found → label-photo prompt, and the gallery-upload + camera-capture inputs (unchanged behaviour).
- **Add manual-barcode entry**: an "Enter barcode" affordance that reveals a numeric input + "Go" → `runBarcode(value)` (moved from Home). Lives alongside the upload/capture fallbacks.

**LoadingOverlay** (`src/components/LoadingOverlay.tsx` + `.module.css`):
- Replace the circular spinner ("bowl"/ring/"P") with a **QR-scan animation**: a small QR-motif grid with a **lime scan-line + soft sweep band** moving vertically over it. Keep the message (default "Parakhing your food…") and sub ("Reading the label & scoring it"), the dark gradient background, and `role="status"`.
- `@media (prefers-reduced-motion: reduce)`: stop the sweep (static QR), no motion.

**App** (`src/App.tsx`): update the HomeScreen render to pass only the slimmed props (it already wires `onOpenCamera`, `onOpenProduct`, `onSeeHistory`, `onSignIn`/`signOut`). ScanScreen wiring is unchanged.

## Components / behaviour

- The single Scan button reuses the existing quota guard pattern: `remaining === 0` → show `LimitModal` (guest variant offers sign-in); else `onOpenCamera()`.
- Manual barcode in ScanScreen mirrors the old Home behaviour: toggling reveals an input; Enter or "Go" calls `runBarcode`; disabled while `busy`.
- The QR loader is purely presentational (CSS animation); same `message` prop API as today, so all call sites (`busy` in ScanScreen, and any future) keep working.

## Testing

- **HomeScreen.test** (rewrite): renders the "Scan a product" button → calls `onOpenCamera`; at `remaining === 0`, tapping it shows `LimitModal` (not `onOpenCamera`); guest limit modal offers sign-in; recent scans render + open; no `<video>` and no upload/manual controls on Home.
- **ScanScreen.test** (add): an "Enter barcode" control reveals an input; entering a number + Go calls the barcode lookup (via injected `scanByBarcode`) → `onResult`. Keep existing upload/capture/needsPhoto tests.
- **LoadingOverlay.test** (add/keep): renders the message text with `role="status"`.
- **App.test** (update): the Home→camera test targets the new button name ("Scan a product").

## Deploy

Frontend only — Vercel auto-deploys on push. No backend, env, or migration.
