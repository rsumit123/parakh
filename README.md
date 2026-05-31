# Parakh

**Parakh** (परख — "to assess quality") scans packaged Indian food and gives you a
single, clear health verdict (A–E / 0–100) with an expandable breakdown. Scan a
barcode; if we don't know the product, photograph the label and AI reads it. Every
new product is scored once and cached forever.

## Structure

- **`backend/`** — FastAPI + SQLite. Scan pipeline (our cache → OpenFoodFacts →
  OpenRouter vision label extraction), deterministic Nutri-Score + India-specific
  scoring, guest/email auth, daily rate limits. See [`backend/README.md`](backend/README.md).
- **`frontend/`** — React + TypeScript (Vite) mobile-first PWA. Barcode scan
  (@zxing) + label-photo fallback, verdict screen with breakdown, guest + email
  login. See [`frontend/README.md`](frontend/README.md).
- **`docs/superpowers/`** — design spec and implementation plans.

## Run locally

```bash
# Backend (terminal 1)
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env          # set PARAKH_SECRET_KEY (and optionally PARAKH_OPENROUTER_API_KEY)
uvicorn app.main:app --port 8000

# Frontend (terminal 2)
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/auth`, `/scan`, `/health`
to the backend on port 8000.

## Tests

```bash
cd backend && pytest -q       # 51 tests
cd frontend && npm test       # 47 tests
```

## Scoring

Nutri-Score backbone (sugar, salt, saturated fat vs. fibre, protein) mapped to
0–100, minus India-specific penalties (palm oil, maida, additives). The AI only
*extracts* label data — a deterministic function does the scoring, so the same
product always gets the same, explainable score.
