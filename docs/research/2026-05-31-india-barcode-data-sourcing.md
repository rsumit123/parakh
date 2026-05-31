# Indian Barcode / Product Data Sourcing for Parakh

**Date:** 2026-05-31
**Question:** What barcode/product data sources exist for Indian packaged food, what can we use, do we need to scrape, and what's needed for a "recommend similar products" feature.

## TL;DR

There is **no cheap, comprehensive, public Indian barcode→nutrition API**. Every serious
India food-scanner app (Truthin, and Yuka in the West) built its catalog the same way:
**crowdsourcing + in-store photography + OCR/AI extraction**, not a licensed feed. Parakh's
existing **photo-scan + cache flywheel is already the correct strategy.** The plan should be
to lean into it (make label capture great, cache aggressively) and use free/cheap sources
(Open Food Facts) as a bonus first-check, not the foundation. Scraping Amazon/BigBasket/Blinkit
is against their ToS and operationally fragile — avoid as a primary source.

## 1. Open / official sources

### Open Food Facts (OFF) India — FREE, open (ODbL)
- Real REST API + full data dumps. Global DB passed ~4M products in 2025.
- **India coverage is small:** hit **10,000 Indian products in Sept 2024** (4,000 of those added
  that year). Tiny vs the size of the Indian FMCG market → explains why most barcode scans miss.
- Data quality for Indian items is inconsistent (missing nutrition fields), partly because Indian
  labels themselves are often poorly printed/disclosed.
- **Verdict:** Keep as a free first-check + a place we could contribute back. Not a foundation.
- License note: ODbL is share-alike for the *database* — fine to query; if we redistribute a
  derived DB we owe attribution + share-alike. Querying per-product for our own scoring is fine.

### GS1 India — DataKart — authoritative, but brand-facing / paid
- GS1 India is who *issues* the barcodes on Indian packs (EAN prefix **890**). DataKart is their
  national product-data repository, populated by brand owners.
- Access is via **paid subscription / "solution provider" registration**, not an open API. Base
  tier bundled with a brand's barcode subscription; premium has registration fees scaled by
  turnover; MSME plans from ~₹3,000+GST. Real product attributes incl. nutrition exist here.
- **Verdict:** The most authoritative source and the right long-term **partnership/licensing**
  play once we have scale/funding. Not a quick drop-in, and pricing for bulk lookup API access
  is not publicly listed → needs a direct sales conversation.

### FSSAI (Indian food regulator) — regulations, NOT an open product DB
- FSSAI defines labelling rules (Labelling & Display Regs 2020; new front-of-pack bold sugar/
  salt/sat-fat rules) and a Food Categorization System (codes), and registers Food Business
  Operators — but there is **no public FSSAI barcode→nutrition dataset** we can pull from.
- **Verdict:** Useful for our scoring *rules* and category taxonomy reference; not a data feed.

## 2. Commercial barcode APIs

General finding: these are **US/EU-skewed**, Indian FMCG coverage is weak, and **nutrition data
is weaker still** (most return name/brand/category/image, not full nutrition facts). Priced per
call. Concrete examples:
- **Go-UPC:** $74.95/mo (5k req), $245/mo (45k), $795/mo (450k) ≈ $0.0018–0.015/req. Lookups by
  UPC/EAN/GTIN; **no stated India coverage.**
- **UPCitemdb:** ~704M barcodes, free tier 100 req/day, paid Dev/Pro tiers. Coverage of Indian
  food + nutrition unverified/likely thin.
- **Barcodelookup, Nutritionix, Edamam, Spoonacular, Syndigo/1WorldSync:** Nutritionix/Edamam are
  nutrition-focused but US-centric; Syndigo/1WorldSync are enterprise GDSN feeds (expensive,
  brand-data). None is a known strong fit for *Indian* packaged-food barcodes.
- **Verdict:** At most a cheap secondary fallback for *name/brand/image* on a barcode miss. Don't
  expect them to solve Indian nutrition coverage. (Coverage claims need per-vendor testing with
  real Indian 890-prefix barcodes before paying.)

## 3. How the incumbents actually do it

- **Truthin (India, "India's first consumer product intelligence app"):** Tried to **scrape ~50,000
  products first and abandoned it** (internet data inaccurate/outdated). Now: **photographers sent
  to supermarkets** to shoot labels, **crowdsourced** images from users, **~20% from internet**,
  and **vision models + OCR** to extract, with **manual verification** before assigning a rating.
  Built a "Data Discovery Platform" automating capture→extract→QC (~15–20 min/product). DB ~16,000
  products (late 2024). **This is exactly the photo+OCR+cache model Parakh already uses.**
- **Yuka:** Started on Open Food Facts, then **built its own DB (2018)** via **user crowdsourcing
  + brand partnerships** with verification layers.
- **OFF:** pure volunteer crowdsourcing.
- **Takeaway:** The moat is an owned, crowd-built catalog. There is no shortcut feed. Parakh's
  flywheel (first scan OCRs+caches, everyone after is instant) is the same engine — we just need
  volume + capture quality.

## 4. Scraping Amazon India / BigBasket / Blinkit

- **Legally/operationally fragile:** against their ToS, actively anti-botted, and redistributing
  scraped catalog/nutrition data is a real legal/IP risk. Third-party "grocery scraping" vendors
  exist but that doesn't make redistribution clean.
- Also a **data-quality** problem: e-commerce listings often lack a clean nutrition panel; you'd
  still be OCR-ing label images — which we already do from the user's own photo, legitimately.
- **Verdict:** Do **not** make scraping a primary/again-redistributed source. (A narrow, polite,
  cache-on-demand enrichment for a name/image is a grey area at best — not worth the risk now.)

## 5. "Recommend similar / healthier products in the same category"

What it needs:
1. **A category per product** — OFF returns categories (and a taxonomy); for photo-scanned items
   our vision model can infer a category (snacks/biscuits/noodles/drinks…). FSSAI's Food
   Categorization System is a reference taxonomy if we want an India-specific one.
2. **A pool of scored products in that category** — this is just our own growing DB. Coverage
   compounds with usage.
3. **A query**: same category, higher grade → top N. Trivial once 1 + 2 exist
   (e.g. `/alternatives?category=…&min_grade=…`).
- **Verdict:** Cheapest unlock is to **store a `category` field on every product** now (infer via
  vision on photo scans, copy from OFF on barcode hits). The feature becomes possible the moment
  we have a handful of scored items per category. No external data purchase required.

## Recommended sourcing strategy for Parakh

1. **Double down on the owned flywheel (primary):** make label-photo capture excellent and cache
   every result by barcode forever. This is what Truthin/Yuka did; it's our real moat.
2. **Capture the barcode during photo scans** so photo-sourced products become barcode-searchable
   next time (closes the loop; currently photo uploads mint a synthetic key).
3. **Keep Open Food Facts as the free first-check** on a barcode (already done), and consider
   **contributing** our verified extractions back (community goodwill + we benefit from others').
4. **Add a `category` field now** (vision-inferred on photos, OFF category on hits) to unlock the
   alternatives feature cheaply.
5. **Defer paid APIs** — only add a cheap commercial barcode API (e.g. Go-UPC) as a *name/brand/
   image* fallback if/when we see it materially reduces "unknown product" rate in real testing.
   Test India 890-barcode coverage on a free tier before paying.
6. **GS1 India / DataKart = the serious long-term licensing play** for authoritative coverage —
   pursue as a partnership once there's scale/funding. Not a quick integration.
7. **Don't build on scraping** Amazon/BigBasket/Blinkit (ToS + legal + quality).

## Sources
- Open Food Facts India 10k milestone (Sep 2024): https://blog.openfoodfacts.org/en/news/open-food-facts-india-database-reaches-10k-product-milestone
- OFF data/API: https://world.openfoodfacts.org/data
- GS1 India DataKart: https://www.gs1india.org/services/datakart ; premium fees: https://www.gs1india.org/datakart/datakart-premium
- Truthin data approach: https://thebetterindia.com/372834/truthin-app-healthy-food-choices-scan-barcode-easy-food-labels-foodpharmer/
- Yuka database origin: https://help.yuka.io/l/en/article/5a4z64amnk-how-was-the-database-created
- Go-UPC pricing: https://go-upc.com/plans ; UPCitemdb: https://www.upcitemdb.com/
- FSSAI labelling / FCS: https://www.fssai.gov.in/ ; https://www.foodlabelsolutions.com/info-centre/Labelling-regulations/indian-food-code-food-categorization-system-fcs-of-india/
- Web scraping legality overview: https://www.promptcloud.com/blog/is-web-scraping-legal/
