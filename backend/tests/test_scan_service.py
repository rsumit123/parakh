import pytest
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository
from app.services.scan import ScanService, ProductNotFound

HEALTHY = {"energy_kj": 300, "sugars_g": 2, "sat_fat_g": 0.5, "salt_g": 0.1,
           "fibre_g": 5, "protein_g": 9, "fruit_veg_nuts_pct": 0}


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
