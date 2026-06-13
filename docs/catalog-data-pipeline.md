# Catalog Data Pipeline — How Products (incl. ingredients & nutrition) Are Extracted and Stored

**Audience:** an engineer/agent taking over catalog growth. This is the complete,
self-contained runbook for turning a scraped Amazon-India category into live,
scored, searchable products in the Parakh DB. Read it end-to-end once; after that
the **TL;DR runbook** at the bottom is all you need per pull.

> **Why this doc exists:** the extraction step (Stage 4) runs a fleet of vision
> subagents and is the token-expensive part. Everything here is deterministic and
> cheap *except* Stage 4. Knowing the exact inputs/outputs lets you re-run only what
> you need and hand the work off without re-deriving the design.

---

## 0. The big picture

Two git repos are involved. **They are separate** — do not confuse them.

| Repo / dir | Role | In which repo |
|---|---|---|
| `~/work/scrape-test/` | Upstream scraper (Amazon India). Produces raw `<category>_products.json`. | external, not covered here |
| `~/work/video-upload-s3/` | **Build workspace.** Stages 1–5 (rehost images → worklist → items → extract → assemble). Its own git repo. | `video-upload-s3` |
| `~/work/nutri-content/` (this repo) | The Parakh app. Holds the **pure build helpers** (`backend/scripts/catalog_build.py`), the committed **output** (`backend/scripts/catalog_extracted.json`), and the **load scripts** (Stages 7–9). | `nutri-content` |

Data flows strictly left→right through 9 stages:

```
[scrape] (external)
   │  <category>_products.json   (asin, title, brand, image_urls=Amazon URLs, price, rating…)
   ▼
Stage 1  rehoster/         → fetch images, upload to S3, rewrite URLs
   │  <category>_products_sumits_private.json   (image_urls now point to our S3)
   │  images/<category>/<asin>/<file>.jpg       (local mirror)
   ▼
Stage 2  _build_worklist.py → filter own images, decode barcodes (zxing)
   │  worklist.json
   ▼
Stage 3  _make_items.py     → one input file per product (capped to 12 imgs)
   │  items/<asin>.json  +  items_index.json
   ▼
Stage 4  catalog_extract.workflow.js  → VISION SUBAGENTS read images  ⚠️ token-heavy
   │  extractions/<asin>.json   (nutrition, ingredients, name, image picks, confidence)
   ▼
Stage 5  _assemble.py        → validate + join + barcode pick + denylist
   │  backend/scripts/catalog_extracted.json   (good)   ← COMMIT THIS
   │  backend/scripts/catalog_skipped.json     (rejects + reasons)
   ▼
Stage 6  git commit + push + VM image rebuild  (JSON is baked into the image)
   ▼
Stage 7  seed_catalog.py     → score + upsert into SQLite (source='amazon')
   ▼
Stage 8  dedupe_products.py  → collapse same name+brand
   ▼
Stage 9  backfill_embeddings.py → embed for "Healthier options"
```

**Current state (2026-06-09):** `catalog_extracted.json` holds **1034** records;
`catalog_skipped.json` holds **503**. **14 categories**: spreads & sauces, protein
bars, dry fruits & nuts, bread, dairy, biscuits, chips, drinks, noodles & pasta,
namkeen, health drinks, breakfast cereal, ice cream, chocolate.

> **Stage 4 now has a cheaper default.** The original extractor was a Claude
> *Workflow* (fleet of subagents) that burned session tokens. There is now a direct
> **OpenRouter vision** script — `_batch_extract.py` — that does the same job for a
> fraction of the cost (one Gemini API call per product, no Claude tokens). **Prefer
> it.** The Workflow remains as a fallback. See Stage 4 below.

---

## 1. Stage 1 — Rehost images to S3 (`~/work/video-upload-s3/rehoster/`)

> **Detailed runbook:** `~/work/video-upload-s3/docs/rehoster-runbook.md` (creds,
> preflight, resume/incremental behavior). The summary below is enough for re-runs.

**Why:** the scraper's `image_urls` point at Amazon's CDN, which blocks hotlinking
and rotates URLs. We copy every image to our own public S3 bucket so (a) the app can
serve stable thumbnails and (b) the local mirror can be barcode-decoded and read by
vision agents.

**Input:** `~/work/scrape-test/output/<category>_products.json` (configured in
`rehoster/config.py` → `FILES`, which maps each source filename to a category key).

**Run:**
```bash
cd ~/work/video-upload-s3
python -m rehoster            # needs AWS creds for bucket 'sumits-private-storage'
```

**What it does** (`rehoster/__main__.py`):
1. Preflight: verify AWS creds + bucket public.
2. Copy source JSONs into `source/`.
3. Build a global image worklist across all files.
4. Fetch each unique image **once**, rate-limited to `RATE_PER_MIN=60`, retrying
   transient statuses (429/5xx) with backoff (`rehoster/fetch.py`); validates JPEG.
5. Cache bytes in `images/_cache/` (keyed by URL hash), then place them at the final
   path `images/<category>/<asin>/<original-filename>.jpg`.
6. Upload to S3 (`s3://sumits-private-storage/<category>/<asin>/<file>`).
7. Rewrite each product's `image_urls` to the S3 URLs and write
   `<category>_products_sumits_private.json`.
8. `manifest.json` / `uploaded.json` are **resume state** — re-running skips
   already-uploaded images.

**Outputs (all git-ignored — large/regenerable):**
- `<category>_products_sumits_private.json` — the product list with **our** S3 URLs.
- `images/<category>/<asin>/<file>.jpg` — the local mirror Stages 2 & 4 read.

> ⚠️ **Filename `+` gotcha:** S3 keys URL-encode `+` as `%2B`, but on disk the file
> is a literal `+` (e.g. `71x+rReh-NL.jpg`). Stage 2's `local_path()` URL-decodes so
> the path resolves. If you ever rewrite path logic, preserve this.

If images are already rehosted (you only added products to an existing category),
you can skip Stage 1 and re-run from Stage 2.

---

## 2. Stage 2 — Build the worklist (`_build_worklist.py`)

Decides, per product: which images are **really** this product's, and what barcode
(if any) is printed on them.

**Run:**
```bash
cd ~/work/video-upload-s3
.venv/bin/python _build_worklist.py
# prints: "<N> products; with own images: <M>; with barcode: <K>"
```

**Key logic:**
- **`CATMAP`** maps the source-file key → the app's category bucket. **This MUST
  mirror `CATEGORY_MAP` in `backend/scripts/catalog_build.py`.** If you add a
  category, update BOTH. (e.g. `"curd" → "dairy"`, `"ketchup" → "spreads & sauces"`.)
- **`own(urls, asin)`** keeps only image URLs whose S3 path segment equals the
  product's own asin. (Scrapes sometimes include cross-listed images belonging to a
  *different* asin; those are dropped so we never read the wrong product's label.)
- **`decode(url)`** opens the local image with Pillow and runs **zxing-cpp**; accepts
  only `EAN13/EAN8/UPCA/UPCE` formats whose text is all digits (checksum-valid). Most
  packs photograph the barcode on a back/side image; **only ~50%** decode.

**Output `worklist.json`** — one entry per product:
```jsonc
{
  "asin": "B0F87JCB4Y",
  "title": "Biosash Himalayan Sea Buckthorn Pulp Concentrate 250ml | …",
  "raw_brand": "Visit the Biosash Store",
  "category": "drinks",                 // already the app bucket
  "own_images": ["https://…s3…/drinks/B0F87JCB4Y/61GZ….jpg", …],
  "local_paths": ["/Users/…/images/drinks/B0F87JCB4Y/61GZ….jpg", …],
  "decoded": [["https://…71OO….jpg", "8901234567890", "EAN13"]]   // [] if none
}
```

**Local-only deps:** `zxingcpp`, `pillow` (in `~/work/video-upload-s3/.venv`). These
are **not** in the backend Docker image — barcode decoding happens only on the build
machine.

---

## 3. Stage 3 — Make per-product item files (`_make_items.py`)

Splits the worklist into one small input file per product so each extraction subagent
reads only its own product (keeps agent context tiny and parallel-safe).

**Run:**
```bash
.venv/bin/python _make_items.py    # prints "wrote <N> item files"
```

- Only products **with own images** become items (the rest are skipped here and again
  in Stage 5 as `no_images`).
- **`CAP = 12`** images per product — bounds vision cost; the barcode/nutrition/
  ingredients panels are almost always within the first dozen.

**Outputs:**
- `items/<asin>.json` → `{asin, title, category, local_paths[:12]}`
- `items_index.json` → `{"asins": [...]}` (the list Stage 4 iterates)

---

## 4. Stage 4 — Extract from images (vision) ⚠️ the only AI step

This is the only AI stage. Each product's images are read by a vision model that
transcribes the **nutrition table** and **ingredients list**, picks the best
display/nutrition/ingredients image indices, derives a clean name, and assigns a
confidence. There are **two implementations** that write the identical
`extractions/<asin>.json` — **prefer the cheap one (4A)**.

### 4A — `_batch_extract.py` (PREFERRED — OpenRouter vision, cheap) ✅

Calls OpenRouter's vision model (`google/gemini-2.5-flash` by default) directly — one
API call per product, all its images base64-inlined, `response_format: json_object`.
**No Claude session tokens**, so it's the right default and what addresses the "this
wastes tokens" problem. It auto-skips products that already have an extraction file,
so it doubles as the **backfill** tool.

```bash
cd ~/work/video-upload-s3
export PARAKH_OPENROUTER_API_KEY=sk-or-...        # or OPENROUTER_API_KEY
.venv/bin/python _batch_extract.py --limit 5      # smoke test
.venv/bin/python _batch_extract.py                # all products still missing an extraction
.venv/bin/python _batch_extract.py --category "protein bars"   # one category
# flags: --limit N, --category "<bucket>", --delay <seconds between calls>
```
- Only processes asins in `items_index.json` that have own images **and no existing
  `extractions/<asin>.json`** → safe to re-run; it only fills gaps.
- Retries 429/errors (3 attempts, backoff). Model overridable via `PARAKH_VISION_MODEL`.
- ⚠️ OpenRouter periodically retires vision models — if every call 4xx's, update
  `PARAKH_VISION_MODEL` (see the vision-model notes in project memory / backend config).

### 4B — `catalog_extract.workflow.js` (FALLBACK — Claude Workflow, token-heavy)

The original: a **Workflow** of subagents, one Claude agent per product. Same output,
but it spends session tokens and can hit the session usage limit on big runs. Use only
if OpenRouter is unavailable or you specifically want Claude's vision.

**Run** (from a Claude session in `~/work/video-upload-s3`, via the `Workflow` tool):
```js
Workflow({ scriptPath: "/Users/rsumit123/work/video-upload-s3/catalog_extract.workflow.js" })
// optional smoke test first:  args: { limit: 5 }
```

**Structure** (`pipeline` over asins; concurrency auto-capped ~10):
- **Phase 1 (Index):** one agent `Read`s `items_index.json` → asin list. (Passing the
  list as a file avoids bulk args.) Honors `args.limit` for partial runs.
- **Phase 2 (Extract):** one subagent per asin. Each:
  1. `Read`s `items/<asin>.json`.
  2. `Read`s **each** `local_paths[i]` image (0-based order matters — indices are
     referenced in the output).
  3. Transcribes **nutrition per 100 g**, applying Indian-label conversions:
     - energy **kcal → kJ** (`× 4.184`)
     - sodium **mg → salt g** (`mg × 2.5 / 1000`)
     - per-serving → per-100 g scaling when only per-serving is printed
     - fills all **7** keys (`energy_kj, sugars_g, sat_fat_g, salt_g, fibre_g,
       protein_g, fruit_veg_nuts_pct`), using `0` for genuinely absent values.
     - if several variant panels appear, picks the one matching the title and
       **lowers confidence**.
     - if **no** nutrition table is visible anywhere → `found_nutrition=false`.
  4. `ingredients`: lowercase list of strings.
  5. Picks image indices: `display_image_index` (cleanest front-of-pack),
     `nutrition_image_index`, `ingredients_image_index` (overlap allowed).
  6. `name`: concise consumer name (brand + product, **no** pack size/marketing).
  7. `Write`s the result to `extractions/<asin>.json`, then returns the same object as
     **schema-validated** structured output (`SCHEMA` in the script — the model is
     forced to conform, retrying on mismatch).

> Both 4A and 4B share the **same extraction contract** — identical output keys and
> the same Indian-label conversions (kcal→kJ, sodium→salt, per-serving→100 g). 4A
> encodes them in its `SYSTEM_PROMPT`; 4B in the agent prompt + JSON `SCHEMA`.

**Output `extractions/<asin>.json`** (identical from 4A and 4B):
```jsonc
{
  "asin": "B08L4HDPRK",
  "name": "Mithura Sprouted Health Mix",
  "found_nutrition": true,
  "nutrition": { "energy_kj": 1769.04, "sugars_g": 0, "sat_fat_g": 0,
                 "salt_g": 0.24, "fibre_g": 14.17, "protein_g": 16.66,
                 "fruit_veg_nuts_pct": 0 },
  "ingredients": ["sprouted millets", "grains", "ragi", "almonds", …],
  "display_image_index": 0, "nutrition_image_index": 0, "ingredients_image_index": 2,
  "confidence": "medium"            // high | medium | low
}
```

**Cost & resume notes:**
- Extraction is **idempotent at the file level**: each agent writes its own
  `extractions/<asin>.json`. Re-running overwrites; products that already have a good
  extraction can be skipped by deleting them from `items_index.json` or by only
  re-running missing asins.
- A full category pull of ~400 products is large. The run has previously hit the
  **session usage limit** (resets 4am Asia/Calcutta) — when that happens, the last
  category's agents fail; **backfill** by re-running with an index trimmed to the
  missing asins after the reset.
- To find what's missing: asins in `items_index.json` with **no** matching
  `extractions/<asin>.json`.

---

## 5. Stage 5 — Assemble final records (`_assemble.py`)

Joins `worklist.json` (barcodes, images, brand) with `extractions/` (nutrition,
ingredients, name), validates, and writes the committed output. **Pure logic lives in
`backend/scripts/catalog_build.py`** (importable + unit-tested); `_assemble.py` is
just the I/O wrapper that calls it.

**Run:**
```bash
cd ~/work/video-upload-s3
.venv/bin/python _assemble.py
# prints: extracted / skipped counts, skip reasons, #real barcodes, by-category counts
```

**Per product, in order:**
1. No own images → skip `no_images`.
2. No extraction file → skip `no_extraction`.
3. `validate_nutrition(nutrition, found_nutrition, confidence)`:
   - `found_nutrition=false` → `no_nutrition`
   - `confidence=="low"` → `low_confidence`
   - any core value `< 0` → `implausible:<key>`
   - `energy_kj > 3800` → `implausible:energy_kj`
   - any of sugars/sat_fat/protein/fibre/salt `> 100` (g per 100 g) → `implausible:<key>`
   - all-zero core → `no_nutrition`
4. **NONFOOD denylist** on title+name (drops accessories that scraped into food
   categories, esp. ice-cream: `stabilizer, emulsifier, mould, popsicle maker, scoop,
   gms powder, cmc powder, machine, maker , essence`, …) → skip `non_food`.
5. `pick_barcode(decoded, asin)` → first valid EAN/UPC, else fallback **`amazon:<asin>`**.
6. `assemble_record(...)` builds the final shape. Helpers:
   - `derive_name(agent_name, title)` — prefer the agent's clean name; else first
     segment of the title with pack-size stripped.
   - `clean_brand(raw)` — strips `"Brand: X"` and `"Visit the X Store"` → `X`.
   - `display/nutrition/ingredients_image_url` — resolved from the agent's chosen
     indices into `own_images` (display falls back to image 0).

**Outputs (written into THIS repo, `backend/scripts/`):**
- `catalog_extracted.json` — the **good** records. **Commit this.**
- `catalog_skipped.json` — rejects with reasons (audit; not loaded).

**Final record shape (`catalog_extracted.json`):**
```jsonc
{
  "barcode": "8901725109561",          // real EAN, or "amazon:<asin>"
  "asin": "B07DCPTQ1J",
  "name": "Sunfeast Mom's Magic Cashew & Almond Cookies",
  "brand": "Mom's Magic",
  "category": "biscuits",              // app bucket (see categories.py)
  "ingredients": ["refined wheat flour (maida)", "sugar", "refined palm oil", …],
  "nutrition": { "energy_kj": 2087.8, "sugars_g": 22.7, "sat_fat_g": 10.1,
                 "salt_g": 0, "fibre_g": 0, "protein_g": 7.9, "fruit_veg_nuts_pct": 0 },
  "display_image_url": "https://…s3…/biscuits/B07DCPTQ1J/….jpg",
  "nutrition_image_url": "…",
  "ingredients_image_url": "…",
  "barcode_image_url": "…",
  "confidence": "medium"
}
```

---

## 6. Stage 6 — Commit & deploy the JSON

The catalog JSON is **baked into the Docker image** (`COPY scripts` in the
Dockerfile), so the container must be **rebuilt** before seeding — a plain restart
re-seeds the *old* JSON.

```bash
cd ~/work/nutri-content
git add backend/scripts/catalog_extracted.json backend/scripts/catalog_skipped.json
git commit -m "catalog: add <category> products"
git push origin main

ssh ssh-social 'cd ~/parakh && git pull && cd backend && \
  docker compose up -d --build --force-recreate'
```

---

## 7–9. Load into the live DB (run inside the container)

All three run via `docker exec parakh-backend python -m scripts.<name>` and are
**idempotent**. Run them in this order after every pull:

```bash
ssh ssh-social
docker exec parakh-backend python -m scripts.seed_catalog        # Stage 7
docker exec parakh-backend python -m scripts.dedupe_products     # Stage 8  (--dry-run first to preview)
docker exec parakh-backend python -m scripts.backfill_embeddings # Stage 9  (needs PARAKH_OPENAI_API_KEY)
```

- **Stage 7 `seed_catalog.py`** — loads `catalog_extracted.json`, scores each record
  through the **real scorer** (`app.scoring.scorer.score`), and upserts via
  `ProductRepository.save(source="amazon")`. Idempotent by barcode (re-seeding
  overwrites). One bad record never aborts the run.
- **Stage 8 `dedupe_products.py`** — `repo.dedupe_by_name_brand()` collapses rows with
  the same normalized name+brand to one **best** row (keeps real barcode over
  `amazon:<asin>`, then imaged, then higher score). Overlapping category pulls create
  dups; this cleans them. Preview with `--dry-run`.
- **Stage 9 `backfill_embeddings.py`** — batch-embeds (200/call) any product missing
  an embedding using OpenAI `text-embedding-3-small` (256-dim), powering semantic
  "Healthier options". Idempotent (only embeds rows with empty `embedding`).
- **`backfill_categories.py`** (occasional) — re-runs `normalize_category()` over all
  stored rows; use after changing the taxonomy in `app/categories.py`.

**Verify live:** scan a known barcode and confirm DB hit + score + alternatives, e.g.
```bash
TOK=$(curl -s -X POST https://parakh-api.skdev.one/auth/guest -H 'Content-Type: application/json' -d '{"device_id":"verify"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s -X POST https://parakh-api.skdev.one/scan/barcode -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"barcode":"8901725109561"}'
```

---

## Adding a NEW category — exact checklist

1. Provide `~/work/scrape-test/output/<category>_products.json` and add it to
   `rehoster/config.py → FILES`.
2. **`app/categories.py`** — add a bucket to `_BUCKETS` if the category is new.
   ⚠️ Order matters (first match wins): e.g. **ice cream before dairy** (ice-cream
   ingredients contain "milk"); **chips before namkeen**; **dairy LAST** so bare
   "milk" doesn't grab milk chocolate/bread.
3. **`backend/scripts/catalog_build.py → CATEGORY_MAP`** — add `"<file_key>": "<bucket>"`.
4. **`~/work/video-upload-s3/_build_worklist.py → CATMAP`** — add the SAME entry
   (these two maps must agree).
5. **Frontend Explore** — add the tile emoji + `.t_<word>` gradient in
   `ExploreScreen.tsx` / `.module.css`.
6. Run Stages 1→9.

---

## TL;DR runbook (existing category, images already rehosted)

```bash
# --- build machine (~/work/video-upload-s3) ---
cd ~/work/video-upload-s3
.venv/bin/python _build_worklist.py        # 2: barcodes + own-image filter
.venv/bin/python _make_items.py            # 3: per-product inputs
export PARAKH_OPENROUTER_API_KEY=sk-or-... # 4: PREFERRED cheap vision extractor (no Claude tokens)
.venv/bin/python _batch_extract.py         #    (auto-skips already-extracted; --limit 5 to smoke-test)
#   4 fallback: Workflow({ scriptPath: ".../catalog_extract.workflow.js" })  (Claude subagents, token-heavy)
.venv/bin/python _assemble.py              # 5: validate + write catalog_extracted.json

# --- this repo (~/work/nutri-content) ---
git add backend/scripts/catalog_extracted.json backend/scripts/catalog_skipped.json
git commit -m "catalog: <category>" && git push origin main

# --- VM ---
ssh ssh-social 'cd ~/parakh && git pull && cd backend && docker compose up -d --build --force-recreate'
ssh ssh-social 'docker exec parakh-backend python -m scripts.seed_catalog'
ssh ssh-social 'docker exec parakh-backend python -m scripts.dedupe_products'
ssh ssh-social 'docker exec parakh-backend python -m scripts.backfill_embeddings'
```

---

## File reference

**Build repo `~/work/video-upload-s3/` (git-ignores images/, source/, *_sumits_private.json, *.log):**
| File | Stage | Role |
|---|---|---|
| `rehoster/` | 1 | Fetch images → S3, rewrite URLs (needs AWS creds). Runbook: `docs/rehoster-runbook.md` |
| `_build_worklist.py` | 2 | Own-image filter + zxing barcode decode → `worklist.json` |
| `_make_items.py` | 3 | `items/<asin>.json` + `items_index.json` |
| **`_batch_extract.py`** | 4A | **PREFERRED** OpenRouter-vision extraction (cheap, no Claude tokens); auto-skips done → `extractions/<asin>.json` |
| `catalog_extract.workflow.js` | 4B | Fallback Claude-Workflow extraction (same output, token-heavy) |
| `_assemble.py` | 5 | Validate + join → writes catalog_extracted/skipped into the app repo |
| `worklist.json`, `items/`, `extractions/` | — | Intermediate artifacts (regenerable) |

**App repo `~/work/nutri-content/backend/scripts/`:**
| File | Stage | Role |
|---|---|---|
| `catalog_build.py` | 5 | **Pure helpers** (CATEGORY_MAP, clean_brand, derive_name, validate_nutrition, pick_barcode, assemble_record). Unit-tested. |
| `catalog_extracted.json` | output | **Committed** good records (baked into Docker image) |
| `catalog_skipped.json` | output | Committed audit of rejects + reasons |
| `seed_catalog.py` | 7 | Score + upsert into DB (`source='amazon'`) |
| `dedupe_products.py` | 8 | Collapse name+brand dups |
| `backfill_embeddings.py` | 9 | Embed for Healthier options |
| `backfill_categories.py` | maint | Re-normalize categories after taxonomy changes |

**Conversions reference (Indian labels → our per-100 g schema):**
- energy: `kcal × 4.184 = kJ`
- sodium→salt: `salt_g = sodium_mg × 2.5 / 1000`
- per-serving → per-100 g: `value × 100 / serving_g`
- nutrition keys (all 7 required): `energy_kj, sugars_g, sat_fat_g, salt_g, fibre_g, protein_g, fruit_veg_nuts_pct`
