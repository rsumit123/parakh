# Amazon Catalog Import (Phase 1) — Design Spec

**Date:** 2026-06-02
**Status:** Approved (design), pending implementation plan

## Goal

Import the scraped Amazon-India product catalog (`~/work/video-upload-s3`, 344 products across 4 categories) into Parakh: extract nutrition + ingredients from each product's label images, decode its real barcode where possible, score it with the existing scorer, and store it with a display image. This enriches the "Healthier options" alternatives pool and gives every product a real photo on the result screen.

## Why

- The catalog has rich product images (front pack, nutrition table, ingredients, barcode) but **no structured nutrition/ingredients/barcode fields** — the data lives in the images.
- Parakh's catalog is currently ~21 hand-seeded products, so most real scans land in a category of one and show no alternatives. 344 scored products fix that.
- ~51% of products have a decodable barcode in their images → those become **physically scannable** in Parakh (instant DB hit with photo + score).
- The app is entirely text today; a product photo on the result screen makes a scan feel real.

## Scope

**Phase 1 (this spec):** extraction → committed JSON → seeder → DB; plus surfacing product images on scans. Two parts:
- **Part A — one-time, agent-orchestrated build** (run now by Claude Code; NOT shipped production code): decode barcodes, fan out subagents to extract label data, assemble a committed `catalog_extracted.json`.
- **Part B — shipped code**: a deterministic seeder, the `image_url` column + migration, and product-image surfacing (Open Food Facts capture + ResultScreen display + alternative thumbnails).

**Deferred to Phase 2 (separate spec):** a browse/Explore screen and name search; storing price/rating/image gallery; scaling extraction to thousands via a provider Batch API.

## Data source

`~/work/video-upload-s3/`:
- 4 files `*_products_sumits_private.json` (lists of product objects; `image_urls` already rewritten to S3). Categories + counts: `breakfast` 99, `drinks` 98, `namkeen_snacks` 99, `dark_chocolate` 48 = **344**.
- Product fields: `asin`, `title`, `brand` ("Visit the X Store"), `price`, `rating`, `review_count`, `canonical_url`, `image_urls` (S3), `currency`. No nutrition/ingredients/barcode.
- Local image mirror at `images/<category>/<asin>/<filename>` (literal `+` on disk), 1,944 files, **273 ASIN folders** (so ~71 products have no own-image folder).
- **Known data-quality wrinkles:** (1) `image_urls` can include foreign-ASIN images (related-product carousel) — must filter to the URL/path segment matching the product's own `asin`; (2) even own-ASIN folders can bundle *variant* images (one product had two different nutrition panels) — the extractor must pick one coherent panel.

## Architecture

### Part A — one-time agent-orchestrated build

A build process (run by Claude Code now; a helper script + a Workflow) produces two committed JSON files. It is NOT part of the deployed app.

**Pass 1 — Barcode (programmatic, `zxing-cpp`):**
- For each product, scan its **own-ASIN local images** with `zxing-cpp`.
- Take the first result whose format is EAN-13/EAN-8/UPC-A/UPC-E and whose text is all digits (checksum-validated by the decoder) → the product's **real barcode** and the **barcode image URL**.
- No decode → barcode is `amazon:<asin>` (synthetic key; not physically scannable).
- Never let an LLM read barcode digits — checksum-validated decode only.
- `zxing-cpp` + `pillow` are **build-time-only** deps (run on the dev machine where the dataset lives); they are NOT added to the backend/Docker runtime.

**Pass 2 — Vision (subagents via the Workflow tool):**
- Fan out one subagent per product (~10–12 concurrent), each given that product's own-ASIN local image paths + its `title`/`category`.
- Each subagent reads the images and returns a schema-validated object (see "Subagent output schema"). It must: extract per-100g nutrition (converting Indian kcal→kJ and sodium mg→salt g, as the live extractor prompt already documents); extract the ingredients list; and identify which image is the **display** (clean front-of-pack), **nutrition**, and **ingredients** shot (indices may overlap). When multiple/variant panels exist, pick the one matching the product title/pack and report `confidence`.
- Rationale: a reasoning vision model (Sonnet/Opus) reads these labels as well as or better than the cheap live extractor and handles variant disambiguation; quality was confirmed by direct inspection during brainstorming.

**Assembly + sanity checks:**
- Merge Pass 1 + Pass 2 per product. Clean brand, map category (below).
- Apply **plausibility checks** to extracted nutrition; failures (and products with no own images / no nutrition found / low confidence) go to `catalog_skipped.json` (the "revisit later" list), NOT the catalog.
- Write `backend/scripts/catalog_extracted.json` (the survivors — facts only, no scores) and `backend/scripts/catalog_skipped.json` (report with reason per product).
- **Human spot-check:** because each record carries the exact `nutrition_image_url`/`ingredients_image_url` it used, the committed JSON can be eyeballed before seeding.

### Part B — shipped code

**Data model** (`backend/app/models.py`): add `Product.image_url: Mapped[str] = mapped_column(String, default="")`. Migrate existing DBs via `_ADDED_COLUMNS` in `db.py`: `"products": {... , "image_url": "VARCHAR DEFAULT ''"}`.

**Repository** (`backend/app/repositories/products.py`): `save(...)` gains an `image_url: str = ""` param and sets `p.image_url`; `_to_dict` returns `image_url`. (Default keeps existing callers/tests working.)

**Seeder** (`backend/scripts/seed_catalog.py`): reads `catalog_extracted.json`; for each record it uses the record's `category` directly (already a fixed Parakh bucket), computes the score at seed time with `score_fn(ingredients, nutrition, category)` (deterministic, in-code — same pattern as `seed_products.py`), then `repo.save(barcode=<real-or-amazon:asin>, name, brand, category, ingredients, nutrition, score, source="amazon", image_url=display_image_url)`. Idempotent upsert. Bundled in Docker (Dockerfile already `COPY scripts ./scripts`).

**Duplicate guard (read-time, non-destructive):** a catalog product stored under a synthetic `amazon:<asin>` key can later be re-stored under its real barcode when a user scans it (different primary key → two rows for one product). We do NOT merge by name (size/flavour variants share names — fusing them would corrupt scores). Instead, alternatives are de-duplicated at read time: `find_better_in_category` gains an `exclude_name_brand: str = ""` param; it fetches a few extra candidates and drops any whose normalized `name|brand` equals the scanned product's (via a shared `_norm_key(name, brand)` = lowercased, whitespace-collapsed `"{name}|{brand}"`), then trims to `limit`. `ScanService._envelope` passes the scanned product's `_norm_key`. This guarantees a product is never suggested as its own healthier option, even if a duplicate row exists. Storage-level dedup/merge is deferred.

**Product-image surfacing:**
- **Open Food Facts client** (`clients/openfoodfacts.py`): extract a front image URL (`image_front_url` → `image_url` → `selected_images.front.display.*` fallbacks) and return it as `image_url` in the normalized dict, so real (non-catalog) barcode scans also get a photo.
- **ScanService** (`services/scan.py`): thread `image_url` through `_score_and_cache` into `repo.save`; photo scans pass `image_url=""`. The product dict (and thus each alternative dict) now carries `image_url`.
- **Frontend** (`src/api/types.ts`): add `image_url?: string` to `Product`. **ResultScreen**: render the product image at the top of the score hero when present (graceful when absent). **Alternatives list**: show a small thumbnail per alternative when `image_url` is present.

## Data shapes

**Subagent output schema (Pass 2):**
```json
{
  "name": "Kellogg's Multigrain Chocos",
  "found_nutrition": true,
  "nutrition": {"energy_kj": 0, "sugars_g": 0, "sat_fat_g": 0, "salt_g": 0,
                "fibre_g": 0, "protein_g": 0, "fruit_veg_nuts_pct": 0},
  "ingredients": ["..."],
  "display_image_index": 0,
  "nutrition_image_index": 3,
  "ingredients_image_index": 2,
  "confidence": "high"
}
```
`name` is the concise consumer-facing product name read off the front pack (brand + product, dropping pack size and marketing copy). `found_nutrition=false` (or `confidence=low`) → product is skipped. Indices map back to the ordered own-ASIN image URL list passed to the agent.

**`catalog_extracted.json` record (committed, facts only):**
```json
{
  "barcode": "8904063200365",
  "asin": "B005OR9ED8",
  "name": "Haldiram's Bombay Mixture",
  "brand": "Haldiram's",
  "category": "namkeen",
  "ingredients": ["gram pulse", "peanuts", "edible vegetable oil (...)", "..."],
  "nutrition": {"energy_kj": 2022, "sugars_g": 1.6, "sat_fat_g": 5.0, "salt_g": 1.3,
                "fibre_g": 0, "protein_g": 18.9, "fruit_veg_nuts_pct": 0},
  "display_image_url": "https://sumits-private-storage.s3.amazonaws.com/namkeen_snacks/B005OR9ED8/71ACZ9wB-QL.jpg",
  "nutrition_image_url": "...",
  "ingredients_image_url": "...",
  "barcode_image_url": "...",
  "confidence": "high"
}
```

## Rules

**Category map** (filename → Parakh bucket): `breakfast` → `breakfast cereal`, `dark_chocolate` → `chocolate`, `drinks` → `drinks`, `namkeen_snacks` → `namkeen`. (These are existing `_BUCKETS` values, so alternatives match across catalog + real scans.)

**Name derivation:** use the subagent's `name` (read off the front pack). If missing/empty, fall back to a cleaned `title`: take the first segment before `|` or `,`, strip a trailing pack size (e.g. `385G`, `1.05kg`), and trim. The product name is used for display (result heading, alternative cards, share card) and Phase 2 search; it is NOT used for scoring or category.

**Brand cleanup:** strip Amazon storefront wrapping — `"Visit the Kellogg's Store"` / `"Kellogg's Store"` → `"Kellogg's"`; trim trailing `" Store"`; `null`/empty → `""`.

**Own-image filter:** keep only `image_urls` whose path segment after the category equals the product's `asin`.

**Plausibility sanity checks** (reject → skip) on per-100g nutrition: every value `>= 0`; `energy_kj` within `0–3800` (≈0–900 kcal/100g); `sugars_g`, `sat_fat_g`, `protein_g`, `fibre_g`, `salt_g` each `<= 100`; `sugars_g <= carbs` is not checkable (we don't store carbs) so skipped; require `found_nutrition=true` and at least one core nutrient `> 0` (mirrors `_has_usable_nutrition`).

## Error handling

- Product with **no own-ASIN images** → skip, reason `no_images`.
- Subagent `found_nutrition=false` or `confidence=low` → skip, reason `no_nutrition` / `low_confidence`.
- Sanity-check failure → skip, reason `implausible:<field>`.
- All skips recorded in `catalog_skipped.json` with `{asin, category, reason}` for a later pass.
- Seeder: a malformed record logs and is skipped without aborting the run.

## Testing (TDD; no live network in tests)

**Backend unit (pure functions / mocked):**
- Barcode pick: given a fake decoder returning formats, choose the first valid EAN/UPC; none → `amazon:<asin>`.
- Brand cleanup: the storefront variants → clean brand; `None` → `""`.
- Name derivation: subagent `name` used when present; missing → cleaned from `title` (first segment before `|`/`,`, trailing pack size stripped).
- Category map: each of the 4 filenames → expected bucket.
- Plausibility validator: plausible passes; each implausible case (negative, energy 99999, sugar 250, all-zero) is rejected with the right reason.
- Record assembly: merges barcode + extraction + cleaned fields into the committed-record shape.
- `seed_catalog`: against a 2-row fixture JSON → upserts → `repo.get` returns scored rows with `image_url`, `source="amazon"`, real barcode used when present.
- Migration: pre-existing `products` table without `image_url` gains it after `init_db` (mirrors the existing category/google migration tests).
- Repository: `save(..., image_url=...)` round-trips via `_to_dict`.
- Duplicate guard: `find_better_in_category(..., exclude_name_brand=_norm_key(name, brand))` drops a candidate that shares the scanned product's normalized name+brand even though its barcode differs (simulating an `amazon:<asin>` twin), and still returns up to `limit` others; `_norm_key` normalizes case/whitespace.
- OFF client: respx-mocked payload with `image_front_url` → normalized dict has `image_url`; absent → `""`.
- ScanService: `image_url` from OFF flows into the product dict and into alternative dicts.

**Frontend (vitest):**
- ResultScreen renders an `<img>` when `product.image_url` is set; renders nothing/!broken when absent.
- Alternatives list renders a thumbnail when an alternative has `image_url`.

## Deploy

- Commit `catalog_extracted.json`, `seed_catalog.py`, the model/migration/repo/OFF/scan changes, and the frontend changes.
- Push; on the VM: `git pull` → `docker compose up -d --build --force-recreate` (the `image_url` migration runs on startup) → `docker exec parakh-backend python -m scripts.seed_catalog`.
- `zxing-cpp`/`pillow` are NOT installed on the VM (extraction already done locally; only the JSON ships).
- Vercel auto-deploys the frontend on push (no new env vars).

## Risks / limitations

- **Variant bundling:** a few products may get a sibling variant's nutrition panel. Mitigated by reasoning-model disambiguation, sanity checks, and human spot-check; residual errors are low-stakes for alternatives/browse and correctable in the JSON.
- **Barcode coverage ~51%:** the rest use `amazon:<asin>` keys — browsable and in the alternatives pool, but not physically scannable. Acceptable for Phase 1.
- **Extraction uses Claude usage** (one-time, ~344 products × several images). Output is committed so it's never re-run on deploy.
- **Non-determinism of extraction** is bounded by committing the JSON + spot-check; scoring itself stays deterministic (computed in-code at seed time).
- **No EAN→ASIN reconciliation:** if a real barcode we decode later also gets scanned and exists in OFF, our `source="amazon"` DB row wins (DB is checked first) — intended (our scored data with image).

## Out of scope (Phase 2+)

Browse/Explore screen, name search, storing price/rating/image gallery, a visual extraction-review tool, and Batch-API scaling for thousands of products.
