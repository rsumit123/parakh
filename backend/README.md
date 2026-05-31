# Parakh Backend

FastAPI service that scans a packaged-food barcode (or label photo) and returns a
single 0–100 health score (Nutri-Score + India-specific penalties). Unknown
products are resolved via OpenFoodFacts, then via an OpenRouter vision model on a
label photo, and cached in SQLite so future scans are instant.

## Setup

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env   # then set PARAKH_OPENROUTER_API_KEY for the photo path
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

`GET /health` should return `{"status":"ok"}`.

## Test

```bash
pytest -q
```

## Endpoints

| Method | Path            | Purpose                                            |
|--------|-----------------|----------------------------------------------------|
| POST   | `/auth/guest`   | `{device_id}` → guest token (3 scans/day)          |
| POST   | `/auth/login`   | `{email}` → free-user token (10 scans/day)         |
| POST   | `/scan/barcode` | `{barcode}` → score (our DB → OpenFoodFacts)       |
| POST   | `/scan/photo`   | multipart `barcode` + `image` → score (vision)     |
| GET    | `/health`       | liveness                                           |

All `/scan/*` calls require `Authorization: Bearer <token>`. Quota is consumed
only on a successful scan — a 404 "needs photo" or a 422 "unreadable label" does
not burn the user's daily allowance.

## Manual smoke test

```bash
# 1. Get a guest token
TOKEN=$(curl -s localhost:8000/auth/guest -H 'Content-Type: application/json' \
  -d '{"device_id":"dev1"}' | python -c 'import sys,json;print(json.load(sys.stdin)["token"])')

# 2. Scan a real barcode that exists in OpenFoodFacts
curl -s localhost:8000/scan/barcode -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"barcode":"8901058000177"}' | python -m json.tool
```

A second identical scan returns `"source":"db"` (served from cache).
