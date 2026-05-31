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


def _save(repo, barcode, category, overall, grade="C"):
    repo.save(barcode=barcode, name=f"P{barcode}", brand="B", category=category,
              ingredients=[], nutrition={"sugars_g": 1.0},
              score={"overall": overall, "grade": grade, "breakdown": {}}, source="off")


def test_category_roundtrips(repo):
    _save(repo, "111", "biscuits", 40)
    assert repo.get("111")["category"] == "biscuits"


def test_find_better_in_category_returns_higher_scorers_best_first(repo):
    _save(repo, "bad", "biscuits", 20)
    _save(repo, "mid", "biscuits", 55)
    _save(repo, "good", "biscuits", 80)
    _save(repo, "other", "chips", 90)          # different category — excluded
    out = repo.find_better_in_category(category="biscuits", min_overall=30,
                                       exclude_barcode="bad")
    assert [p["barcode"] for p in out] == ["good", "mid"]  # >30, best first, sorted


def test_find_better_excludes_self_and_caps_limit(repo):
    for i in range(5):
        _save(repo, f"b{i}", "noodles", 50 + i)
    out = repo.find_better_in_category(category="noodles", min_overall=40,
                                       exclude_barcode="b4", limit=3)
    assert "b4" not in [p["barcode"] for p in out]
    assert len(out) == 3


def test_find_better_in_empty_category_returns_nothing(repo):
    _save(repo, "x", "", 90)
    assert repo.find_better_in_category(category="", min_overall=0, exclude_barcode="z") == []
