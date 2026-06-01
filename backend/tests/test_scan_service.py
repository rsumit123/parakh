import pytest
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository
from app.services.scan import ScanService, ProductNotFound

HEALTHY = {"energy_kj": 300, "sugars_g": 2, "sat_fat_g": 0.5, "salt_g": 0.1,
           "fibre_g": 5, "protein_g": 9, "fruit_veg_nuts_pct": 0}
# Scores poorly via the real scorer (high sugar/sat-fat/salt) — used to make a
# scanned product genuinely worse than a seeded healthy alternative.
JUNK = {"energy_kj": 2200, "sugars_g": 40, "sat_fat_g": 12, "salt_g": 1.5,
        "fibre_g": 0.5, "protein_g": 1, "fruit_veg_nuts_pct": 0}
EMPTY_NUTRITION = {"energy_kj": 0, "sugars_g": 0, "sat_fat_g": 0, "salt_g": 0,
                   "fibre_g": 0, "protein_g": 0, "fruit_veg_nuts_pct": 0}


class FakeOFF:
    def __init__(self, result): self.result = result; self.calls = 0
    def fetch(self, barcode):
        self.calls += 1
        return self.result


class FakeExtractor:
    def __init__(self, result): self.result = result
    def extract(self, image_bytes): return self.result


@pytest.fixture
def repo():
    engine = make_engine("sqlite://")
    init_db(engine)
    return ProductRepository(make_session_factory(engine))


def test_db_hit_returns_cached_and_skips_off(repo):
    repo.save(barcode="111", name="Cached", brand="B", ingredients=["x"],
              nutrition=HEALTHY, score={"overall": 84, "grade": "A", "breakdown": {}},
              source="off")
    off = FakeOFF(None)
    svc = ScanService(repo, off, FakeExtractor(None))
    res = svc.scan_barcode("111")
    assert res["source"] == "db"
    assert res["product"]["name"] == "Cached"
    assert off.calls == 0


def test_off_fallback_scores_and_caches(repo):
    off = FakeOFF({"name": "Chana", "brand": "Tata", "ingredients": ["chana"],
                   "nutrition": HEALTHY})
    svc = ScanService(repo, off, FakeExtractor(None))
    res = svc.scan_barcode("222")
    assert res["source"] == "off"
    assert res["product"]["score"]["grade"] == "A"
    # now cached -> second call is a db hit
    res2 = svc.scan_barcode("222")
    assert res2["source"] == "db"


def test_barcode_not_found_raises(repo):
    svc = ScanService(repo, FakeOFF(None), FakeExtractor(None))
    with pytest.raises(ProductNotFound):
        svc.scan_barcode("333")


def test_photo_path_extracts_scores_and_caches(repo):
    extractor = FakeExtractor({"name": "Chips", "brand": "Lays",
                               "ingredients": ["potato", "palm oil"],
                               "nutrition": HEALTHY})
    svc = ScanService(repo, FakeOFF(None), extractor)
    res = svc.scan_photo("444", b"img")
    assert res["source"] == "photo"
    assert res["product"]["name"] == "Chips"
    assert repo.get("444") is not None


def test_off_with_no_nutrition_is_treated_as_needs_photo(repo):
    # OFF knows the product name but has no nutrition facts -> don't present a
    # meaningless all-zero score; ask for a label photo instead.
    off = FakeOFF({"name": "Mystery Spread", "brand": "X", "ingredients": [],
                   "nutrition": EMPTY_NUTRITION})
    svc = ScanService(repo, off, FakeExtractor(None))
    with pytest.raises(ProductNotFound):
        svc.scan_barcode("555")


def test_empty_cached_record_is_skipped_and_rescored_from_off(repo):
    # A poisoned/old cache row with no usable nutrition must NOT be served; the
    # pipeline falls through to OFF, re-scores, and overwrites it (self-healing).
    repo.save(barcode="666", name="Old Empty", brand="B", ingredients=[],
              nutrition=EMPTY_NUTRITION,
              score={"overall": 73, "grade": "B", "breakdown": {}}, source="off")
    off = FakeOFF({"name": "Real Product", "brand": "B", "ingredients": ["palm oil"],
                   "nutrition": HEALTHY})
    svc = ScanService(repo, off, FakeExtractor(None))
    res = svc.scan_barcode("666")
    assert res["source"] == "off"               # cache skipped
    assert res["product"]["name"] == "Real Product"  # overwritten
    assert off.calls == 1


def test_empty_cache_and_no_off_data_needs_photo(repo):
    repo.save(barcode="777", name="Old Empty", brand="B", ingredients=[],
              nutrition=EMPTY_NUTRITION,
              score={"overall": 73, "grade": "B", "breakdown": {}}, source="off")
    svc = ScanService(repo, FakeOFF(None), FakeExtractor(None))
    with pytest.raises(ProductNotFound):
        svc.scan_barcode("777")


def test_photo_persists_category_from_extractor(repo):
    extractor = FakeExtractor({"name": "Lays", "brand": "Lays", "category": "potato chips",
                               "ingredients": ["potato"], "nutrition": HEALTHY})
    svc = ScanService(repo, FakeOFF(None), extractor)
    res = svc.scan_photo("c1", b"img")
    # "potato chips" is normalized into the fixed taxonomy bucket so it can be
    # compared against peers (otherwise it would land in a category of one).
    assert res["product"]["category"] == "namkeen"


def test_scan_returns_healthier_alternatives_in_same_category(repo):
    # seed a healthier biscuit in the same category
    repo.save(barcode="good", name="Oat Biscuit", brand="B", category="biscuits",
              ingredients=[], nutrition=HEALTHY,
              score={"overall": 85, "grade": "A", "breakdown": {}}, source="off")
    # now scan a genuinely worse biscuit (via OFF) in the same category
    off = FakeOFF({"name": "Cream Biscuit", "brand": "X", "category": "biscuits",
                   "ingredients": ["sugar"], "nutrition": JUNK})
    svc = ScanService(repo, off, FakeExtractor(None))
    res = svc.scan_barcode("worse")
    # the worse one scores via real scorer; the seeded 85 should appear as an alternative
    alts = res["alternatives"]
    assert any(a["barcode"] == "good" for a in alts)
    # and it should not suggest the product itself
    assert all(a["barcode"] != "worse" for a in alts)


def test_no_alternatives_when_category_unknown(repo):
    off = FakeOFF({"name": "X", "brand": "Y", "ingredients": ["a"], "nutrition": HEALTHY})
    svc = ScanService(repo, off, FakeExtractor(None))
    res = svc.scan_barcode("nocat")
    assert res["alternatives"] == []


def test_off_image_url_flows_into_product(repo):
    off = FakeOFF({"name": "Chana", "brand": "Tata", "ingredients": ["chana"],
                   "nutrition": HEALTHY, "image_url": "https://img/x.jpg"})
    svc = ScanService(repo, off, FakeExtractor(None))
    res = svc.scan_barcode("777")
    assert res["product"]["image_url"] == "https://img/x.jpg"


def test_alternative_twin_with_same_name_is_not_suggested(repo):
    # Seed a healthy alternative that shares the scanned product's name+brand but a
    # different barcode (a catalog 'amazon:' twin). It must not be suggested.
    from app.scoring.scorer import score as score_fn
    twin_score = score_fn(["oats"], HEALTHY, "breakfast cereal")
    repo.save(barcode="amazon:T", name="Choco", brand="ACME",
              category="breakfast cereal", ingredients=["oats"], nutrition=HEALTHY,
              score=twin_score, source="amazon")
    off = FakeOFF({"name": "Choco", "brand": "ACME", "ingredients": ["sugar", "maida"],
                   "nutrition": JUNK})
    svc = ScanService(repo, off, FakeExtractor(None))
    res = svc.scan_barcode("888")
    assert "amazon:T" not in [a["barcode"] for a in res["alternatives"]]
