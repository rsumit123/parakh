"""Seed the Amazon catalog into the Parakh DB from catalog_extracted.json.

Each record is scored through the REAL scorer and upserted via ProductRepository
(source='amazon'), so catalog items are identical in shape to live scans. Idempotent
by barcode. Run inside the backend container:
    docker exec parakh-backend python -m scripts.seed_catalog
"""
import json
import os
from app.config import get_settings
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository
from app.scoring.scorer import score as score_fn

_DATA = os.path.join(os.path.dirname(__file__), "catalog_extracted.json")
_REQUIRED = ("barcode", "name", "category", "ingredients", "nutrition")


def seed_records(repo: ProductRepository, records: list[dict]) -> int:
    seeded = 0
    for r in records:
        if not all(r.get(k) is not None for k in _REQUIRED):
            print(f"  SKIP malformed: {r.get('asin') or r.get('barcode')}")
            continue
        try:
            scored = score_fn(r["ingredients"], r["nutrition"], r["category"])
            repo.save(
                barcode=r["barcode"], name=r["name"], brand=r.get("brand", ""),
                category=r["category"], ingredients=r["ingredients"],
                nutrition=r["nutrition"], score=scored, source="amazon",
                image_url=r.get("display_image_url", ""),
            )
            seeded += 1
            print(f"  {scored['grade']} {scored['overall']:>3}/100  {r['name']}  [{r['barcode']}]")
        except Exception as e:  # one bad record must not abort the whole seed
            print(f"  ERROR {r.get('asin') or r.get('barcode')}: {e}")
    return seeded


def main() -> None:
    settings = get_settings()
    engine = make_engine(settings.db_url)
    init_db(engine)
    repo = ProductRepository(make_session_factory(engine))
    with open(_DATA, encoding="utf-8") as f:
        records = json.load(f)
    print(f"Seeding {len(records)} catalog records into {settings.db_url} ...")
    n = seed_records(repo, records)
    print(f"Done. Seeded {n}/{len(records)}.")


if __name__ == "__main__":
    main()
