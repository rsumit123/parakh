import pytest
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository


@pytest.fixture
def repo():
    engine = make_engine("sqlite://")
    init_db(engine)
    return ProductRepository(make_session_factory(engine))


def test_get_missing_returns_none(repo):
    assert repo.get("does-not-exist") is None


def test_save_then_get_roundtrips(repo):
    repo.save(barcode="111", name="Chana", brand="Tata",
              ingredients=["chana"], nutrition={"sugars_g": 1.0},
              score={"overall": 84, "grade": "A", "breakdown": {}}, source="off")
    p = repo.get("111")
    assert p["name"] == "Chana"
    assert p["score"]["overall"] == 84
    assert p["source"] == "off"


def test_full_score_object_roundtrips(repo):
    # The complete scorer output (verdict/positives/negatives/breakdown) must survive,
    # because the frontend score screen renders exactly those fields on cached reads.
    score = {"overall": 84, "grade": "A", "verdict": "Good choice",
             "positives": ["Fibre (5g)"], "negatives": [],
             "breakdown": {"nutrients": [{"key": "sugars"}], "india_flags": []}}
    repo.save(barcode="111", name="Chana", brand="Tata", ingredients=["chana"],
              nutrition={"sugars_g": 1.0}, score=score, source="off")
    p = repo.get("111")
    assert p["score"]["verdict"] == "Good choice"
    assert p["score"]["positives"] == ["Fibre (5g)"]
    assert p["score"]["negatives"] == []
    assert p["score"]["breakdown"]["india_flags"] == []


def test_save_is_idempotent_upsert(repo):
    repo.save(barcode="111", name="Old", brand="B", ingredients=[],
              nutrition={}, score={"overall": 10, "grade": "E", "breakdown": {}}, source="off")
    repo.save(barcode="111", name="New", brand="B", ingredients=[],
              nutrition={}, score={"overall": 90, "grade": "A", "breakdown": {}}, source="photo")
    p = repo.get("111")
    assert p["name"] == "New"
    assert p["score"]["overall"] == 90
