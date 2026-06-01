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


def test_image_url_roundtrips(repo):
    repo.save(barcode="111", name="Chana", brand="Tata", ingredients=["chana"],
              nutrition={"sugars_g": 1.0},
              score={"overall": 84, "grade": "A", "breakdown": {}}, source="amazon",
              image_url="https://example.com/front.jpg")
    p = repo.get("111")
    assert p["image_url"] == "https://example.com/front.jpg"


def test_image_url_defaults_empty_when_omitted(repo):
    repo.save(barcode="222", name="X", brand="B", ingredients=[], nutrition={},
              score={"overall": 10, "grade": "E", "breakdown": {}}, source="off")
    assert repo.get("222")["image_url"] == ""


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


def test_better_than_grade_requires_a_strictly_better_grade(repo):
    # A B-grade drink (overall 69) must NOT be offered another B (overall 73) as a
    # healthier option — only a strictly better grade (A) qualifies.
    _save(repo, "buttermilk", "drinks", 69, grade="B")
    _save(repo, "cokezero", "drinks", 73, grade="B")   # higher score, SAME grade
    _save(repo, "water", "drinks", 95, grade="A")      # genuinely better grade
    out = repo.find_better_in_category(category="drinks", min_overall=69,
                                       exclude_barcode="buttermilk", better_than_grade="B")
    bcs = [p["barcode"] for p in out]
    assert "cokezero" not in bcs        # same grade -> not a suggestion
    assert "water" in bcs               # better grade -> suggested


def test_better_than_grade_offers_real_upgrade_for_a_D(repo):
    _save(repo, "cola", "drinks", 29, grade="D")
    _save(repo, "zero", "drinks", 73, grade="B")
    out = repo.find_better_in_category(category="drinks", min_overall=29,
                                       exclude_barcode="cola", better_than_grade="D")
    assert "zero" in [p["barcode"] for p in out]
