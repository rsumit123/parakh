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
