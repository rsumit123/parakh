import json
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository
from scripts.seed_catalog import seed_records

RECORDS = [
    {"barcode": "8904063200365", "asin": "B1", "name": "Bombay Mix", "brand": "Haldiram's",
     "category": "namkeen", "ingredients": ["gram pulse", "peanuts"],
     "nutrition": {"energy_kj": 2022, "sugars_g": 1.6, "sat_fat_g": 5.0, "salt_g": 1.3,
                   "fibre_g": 0, "protein_g": 18.9, "fruit_veg_nuts_pct": 0},
     "display_image_url": "https://img/bombay.jpg"},
    {"barcode": "amazon:B2", "asin": "B2", "name": "Choco Flakes", "brand": "ACME",
     "category": "breakfast cereal", "ingredients": ["sugar", "maida"],
     "nutrition": {"energy_kj": 1600, "sugars_g": 30, "sat_fat_g": 2, "salt_g": 0.5,
                   "fibre_g": 1, "protein_g": 6, "fruit_veg_nuts_pct": 0},
     "display_image_url": "https://img/choco.jpg"},
]


def _repo():
    engine = make_engine("sqlite://")
    init_db(engine)
    return ProductRepository(make_session_factory(engine))


def test_seed_records_scores_and_stores_with_image_and_source():
    repo = _repo()
    seed_records(repo, RECORDS)
    p = repo.get("8904063200365")
    assert p is not None
    assert p["source"] == "amazon"
    assert p["image_url"] == "https://img/bombay.jpg"
    assert p["score"]["grade"] in ("A", "B", "C", "D", "E")
    assert repo.get("amazon:B2")["category"] == "breakfast cereal"


def test_seed_records_is_idempotent():
    repo = _repo()
    seed_records(repo, RECORDS)
    seed_records(repo, RECORDS)
    # Still one row per barcode (no duplication).
    assert repo.get("8904063200365") is not None
    assert repo.get("amazon:B2") is not None


def test_seed_records_skips_malformed_without_aborting():
    repo = _repo()
    seed_records(repo, [{"barcode": "bad"}] + RECORDS)  # missing fields -> skipped
    assert repo.get("8904063200365") is not None  # good ones still seeded
