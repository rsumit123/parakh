"""Add carbs_g / fat_g (per 100 g) to cached products, then to logged packaged foods.

Products predate carbs/fat tracking. For each product without those keys:
  - source "off":    re-fetch from OpenFoodFacts.
  - source "amazon": re-read the stored nutrition-label photo (catalog_extracted.json)
                     with the vision model, asking for carbs and fat only.
  - anything else:   no stored label photo, so left unknown.
Every reading is cross-checked against the energy already on record: carbs, fat,
protein and fibre must roughly add up to it (Atwater factors, +/-25%), else the
values are discarded (stored as null = unknown). Nutrients already present are
never changed, so scores are unaffected. Idempotent: products already carrying the
keys (even null) are skipped.

Finally, logged packaged entries with unknown carbs/fat are filled from their
product (per-100 g x quantity).

Run inside the backend container:
    docker exec parakh-backend python -m scripts.backfill_carbs_fat [--limit N] [--dry-run]
"""
import argparse
import json
import os
from concurrent.futures import ThreadPoolExecutor

import httpx
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.config import get_settings
from app.db import make_engine, make_session_factory, init_db
from app.images import data_url
from app.models import FoodLogEntry, Product
from app.clients.openfoodfacts import OpenFoodFactsClient

_PROMPT = (
    "This is a packaged food's nutrition label. Return ONLY a JSON object "
    '{"carbs_g": number|null, "fat_g": number|null} with total carbohydrate and total fat '
    "PER 100 g (or per 100 ml). If the label only gives per-serving values, convert to per "
    "100 g using the serving size. Use null if a value is not printed or not readable. "
    "No prose, JSON only."
)
_TOLERANCE = 0.25


def plausible(carbs, fat, n: dict) -> bool:
    """Do carbs + fat (+ stored protein, fibre) explain the stored energy?"""
    if carbs is None or fat is None:
        return False
    if not (0 <= carbs <= 100 and 0 <= fat <= 100):
        return False
    protein, fibre = float(n.get("protein_g") or 0), float(n.get("fibre_g") or 0)
    if carbs + fat + protein > 105:
        return False
    if float(n.get("sugars_g") or 0) > carbs + 1:  # sugar is part of carbohydrate
        return False
    energy = float(n.get("energy_kj") or 0)
    if energy <= 0:
        return False
    est = 17 * carbs + 37 * fat + 17 * protein + 8 * fibre  # kJ per 100 g
    if energy < 150:  # near-zero-calorie drinks etc.: absolute check, ratios are noisy
        return abs(est - energy) < 80
    return abs(est - energy) / energy <= _TOLERANCE


def _num(v):
    try:
        return None if v is None or v == "" else float(v)
    except (TypeError, ValueError):
        return None


def read_label(image_url: str, settings) -> tuple:
    img = httpx.get(image_url, timeout=30, follow_redirects=True)
    img.raise_for_status()
    body = {"model": settings.vision_model, "response_format": {"type": "json_object"},
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": _PROMPT},
                {"type": "image_url", "image_url": {"url": data_url(img.content)}}]}]}
    r = httpx.post(settings.openrouter_url, json=body, timeout=60,
                   headers={"Authorization": f"Bearer {settings.openrouter_api_key}"})
    r.raise_for_status()
    d = json.loads(r.json()["choices"][0]["message"]["content"])
    return _num(d.get("carbs_g")), _num(d.get("fat_g"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    settings = get_settings()
    engine = make_engine(settings.db_url)
    init_db(engine)
    Session = make_session_factory(engine)
    here = os.path.dirname(__file__)
    with open(os.path.join(here, "catalog_extracted.json")) as f:
        label_url = {r["barcode"]: r.get("nutrition_image_url") for r in json.load(f) if r.get("barcode")}

    with Session() as s:
        todo = [p for p in s.scalars(select(Product)).all() if "carbs_g" not in (p.nutrition or {})]
        if args.limit:
            todo = todo[: args.limit]
        jobs = [(p.barcode, p.source, dict(p.nutrition or {})) for p in todo]
    print(f"{len(jobs)} product(s) without carbs/fat")

    off = OpenFoodFactsClient()

    def work(job):
        barcode, source, n = job
        try:
            if source == "off":
                got = off.fetch(barcode)
                gn = (got or {}).get("nutrition", {})
                return barcode, gn.get("carbs_g"), gn.get("fat_g"), "off"
            if source == "amazon" and label_url.get(barcode):
                c, f = read_label(label_url[barcode], settings)
                if plausible(c, f, n):
                    return barcode, c, f, "label"
                return barcode, None, None, f"rejected (carbs={c}, fat={f})"
            return barcode, None, None, "no label photo"
        except Exception as e:  # network/model hiccup: leave unknown, retry next run
            return barcode, "retry", None, f"error {type(e).__name__}"

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(work, jobs))

    tally: dict[str, int] = {}
    with Session() as s:
        for barcode, c, f, how in results:
            tally[how.split(" (")[0]] = tally.get(how.split(" (")[0], 0) + 1
            if c == "retry":
                continue
            p = s.get(Product, barcode)
            p.nutrition = {**(p.nutrition or {}), "carbs_g": c, "fat_g": f}
            flag_modified(p, "nutrition")
        # Logged packaged foods: fill from the product where we now know it.
        filled = 0
        for e in s.scalars(select(FoodLogEntry).where(FoodLogEntry.barcode.is_not(None))).all():
            p = s.get(Product, e.barcode)
            n = (p.nutrition or {}) if p else {}
            for k in ("carbs_g", "fat_g"):
                if getattr(e, k) is None and n.get(k) is not None:
                    setattr(e, k, float(n[k]) * (e.quantity_g or 0) / 100)
                    filled += 1
        if args.dry_run:
            s.rollback()
        else:
            s.commit()
    print("results:", tally)
    print(f"log values filled: {filled}" + (" (dry run, nothing saved)" if args.dry_run else ""))


if __name__ == "__main__":
    main()
