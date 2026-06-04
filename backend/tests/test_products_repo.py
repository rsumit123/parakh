import pytest
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository
from app.repositories.products import _norm_key as _nk


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


def test_norm_key_normalizes_case_and_space():
    from app.repositories.products import _norm_key
    assert _norm_key("Amul  Dark", "  Amul ") == _norm_key("amul dark", "amul")


def test_find_better_excludes_same_name_brand_twin(repo):
    # A duplicate of the scanned product (same name+brand) stored under a DIFFERENT
    # barcode must NOT be offered as its own healthier option.
    _save(repo, "scan", "chocolate", 40, grade="C")
    repo.save(barcode="amazon:Z", name="Pscan", brand="B", category="chocolate",
              ingredients=[], nutrition={"sugars_g": 1.0},
              score={"overall": 95, "grade": "A", "breakdown": {}}, source="amazon")
    _save(repo, "real", "chocolate", 90, grade="A")  # a genuinely different A
    out = repo.find_better_in_category(
        category="chocolate", min_overall=40, exclude_barcode="scan",
        better_than_grade="C", exclude_name_brand=_nk("Pscan", "B"))
    bcs = [p["barcode"] for p in out]
    assert "amazon:Z" not in bcs   # same name+brand twin dropped
    assert "real" in bcs           # real alternative kept


def test_category_counts_groups_excludes_empty_and_orders_desc(repo):
    _save(repo, "d1", "drinks", 50); _save(repo, "d2", "drinks", 60)
    _save(repo, "n1", "namkeen", 40)
    _save(repo, "u1", "", 70)  # uncategorized -> excluded
    out = repo.category_counts()
    assert out == [{"category": "drinks", "count": 2}, {"category": "namkeen", "count": 1}]


def _saven(repo, barcode, category, overall, grade, name, brand):
    repo.save(barcode=barcode, name=name, brand=brand, category=category,
              ingredients=[], nutrition={"sugars_g": 1.0},
              score={"overall": overall, "grade": grade, "breakdown": {}}, source="amazon")


def test_list_products_by_category_healthiest_first(repo):
    _saven(repo, "a", "drinks", 30, "D", "Cola", "Coke")
    _saven(repo, "b", "drinks", 88, "A", "Coconut Water", "Raw")
    _saven(repo, "c", "namkeen", 90, "A", "Makhana", "Farmley")
    out = repo.list_products(category="drinks")
    assert out["total"] == 2
    assert [p["barcode"] for p in out["items"]] == ["b", "a"]


def test_list_products_grade_filter(repo):
    _saven(repo, "a", "drinks", 30, "D", "Cola", "Coke")
    _saven(repo, "b", "drinks", 88, "A", "Coconut Water", "Raw")
    out = repo.list_products(category="drinks", grade="A")
    assert [p["barcode"] for p in out["items"]] == ["b"]
    assert out["total"] == 1


def test_list_products_search_name_and_brand_case_insensitive(repo):
    _saven(repo, "a", "chocolate", 48, "C", "99% Cacao", "Amul")
    _saven(repo, "b", "drinks", 69, "B", "Buttermilk", "AMUL")
    _saven(repo, "c", "drinks", 29, "D", "Cola", "Coke")
    out = repo.list_products(q="amul")
    assert {p["barcode"] for p in out["items"]} == {"a", "b"}


def test_list_products_limit_clamped_and_total_reported(repo):
    for i in range(5):
        _saven(repo, f"p{i}", "drinks", 50 + i, "B", f"P{i}", "B")
    out = repo.list_products(category="drinks", limit=2)
    assert len(out["items"]) == 2
    assert out["total"] == 5


def _savei(repo, barcode, category, overall, grade, name, brand, image_url):
    repo.save(barcode=barcode, name=name, brand=brand, category=category,
              ingredients=[], nutrition={"sugars_g": 1.0},
              score={"overall": overall, "grade": grade, "breakdown": {}}, source="amazon",
              image_url=image_url)


def test_list_products_excludes_empty_name(repo):
    _saven(repo, "a", "drinks", 50, "C", "", "Amul")  # unknown -> excluded
    _saven(repo, "b", "drinks", 60, "B", "Real Juice", "Dabur")
    out = repo.list_products(category="drinks")
    assert [p["barcode"] for p in out["items"]] == ["b"]
    assert out["total"] == 1


def test_list_products_dedups_by_name_brand_preferring_image(repo):
    _savei(repo, "noimg", "drinks", 70, "B", "Rose Milk", "Amul", "")
    _savei(repo, "img", "drinks", 60, "B", "Rose Milk", "Amul", "http://x/r.jpg")
    _saven(repo, "other", "drinks", 90, "A", "Coconut Water", "Raw")
    out = repo.list_products(category="drinks")
    assert out["total"] == 2  # Rose Milk collapsed to one
    bcs = [p["barcode"] for p in out["items"]]
    assert "noimg" not in bcs and "img" in bcs   # imaged representative kept
    assert bcs == ["other", "img"]               # still healthiest-first overall


def test_category_counts_counts_distinct_products(repo):
    _savei(repo, "x1", "drinks", 70, "B", "Rose Milk", "Amul", "")
    _savei(repo, "x2", "drinks", 60, "B", "Rose Milk", "Amul", "http://x/r.jpg")
    _saven(repo, "u", "drinks", 50, "C", "", "Amul")  # empty name excluded
    out = repo.category_counts()
    assert {"category": "drinks", "count": 1} in out  # 1 distinct named product


def test_dedupe_keeps_real_barcode_imaged_best_and_removes_rest(repo):
    # same product, three rows: amazon no-image, amazon imaged, real-barcode imaged
    _savei(repo, "amazon:Z1", "drinks", 70, "B", "Rose Milk", "Amul", "")
    _savei(repo, "amazon:Z2", "drinks", 75, "B", "Rose Milk", "Amul", "http://x/a.jpg")
    _savei(repo, "890111", "dairy", 60, "B", "Rose Milk", "Amul", "http://x/b.jpg")
    _saven(repo, "other", "drinks", 90, "A", "Coconut Water", "Raw")
    removed = repo.dedupe_by_name_brand()
    assert removed == 2
    # kept row = the real-barcode imaged one (scannable wins)
    assert repo.get("890111") is not None
    assert repo.get("amazon:Z1") is None and repo.get("amazon:Z2") is None
    assert repo.get("other") is not None  # distinct product untouched


def test_dedupe_dry_run_counts_without_deleting(repo):
    _savei(repo, "amazon:A", "drinks", 70, "B", "Rose Milk", "Amul", "")
    _savei(repo, "amazon:B", "drinks", 75, "B", "Rose Milk", "Amul", "http://x/a.jpg")
    n = repo.dedupe_by_name_brand(dry_run=True)
    assert n == 1
    assert repo.get("amazon:A") is not None and repo.get("amazon:B") is not None  # nothing deleted


def test_list_products_search_ignores_punctuation(repo):
    _saven(repo, "a", "chips", 22, "D", "Lay's Classic Salted", "Lay's")
    _saven(repo, "b", "chips", 30, "D", "Bingo Mad Angles", "Bingo")
    assert [p["barcode"] for p in repo.list_products(q="lays")["items"]] == ["a"]
    assert [p["barcode"] for p in repo.list_products(q="lay")["items"]] == ["a"]


def test_find_better_prefers_same_subtype(repo):
    # Scanned: a sweet lassi (C). A healthier buttermilk (dairy, B) should win over a
    # higher-scoring but unrelated sea-buckthorn juice (A).
    _saven(repo, "buttermilk", "drinks", 69, "B", "Amul Masti Buttermilk", "Amul")
    _saven(repo, "juice", "drinks", 88, "A", "Sea Buckthorn Juice", "Wellwith")
    out = repo.find_better_in_category(category="drinks", min_overall=50,
                                       exclude_barcode="scan", better_than_grade="C",
                                       prefer_subtype="dairy")
    assert [p["barcode"] for p in out] == ["buttermilk"]  # juice excluded — wrong sub-type


def test_find_better_shows_nothing_rather_than_wrong_subtype(repo):
    # No healthier DAIRY drink exists, only an unrelated juice -> show nothing, not the juice.
    _saven(repo, "juice", "drinks", 88, "A", "Sea Buckthorn Juice", "Wellwith")
    out = repo.find_better_in_category(category="drinks", min_overall=50,
                                       exclude_barcode="scan", better_than_grade="C",
                                       prefer_subtype="dairy")
    assert out == []
