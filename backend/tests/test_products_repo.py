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


def test_save_is_idempotent_upsert(repo):
    repo.save(barcode="111", name="Old", brand="B", ingredients=[],
              nutrition={}, score={"overall": 10, "grade": "E", "breakdown": {}}, source="off")
    repo.save(barcode="111", name="New", brand="B", ingredients=[],
              nutrition={}, score={"overall": 90, "grade": "A", "breakdown": {}}, source="photo")
    p = repo.get("111")
    assert p["name"] == "New"
    assert p["score"]["overall"] == 90
