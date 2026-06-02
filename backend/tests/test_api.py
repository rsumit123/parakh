import io
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.db import make_engine, make_session_factory, init_db

HEALTHY = {"energy_kj": 300, "sugars_g": 2, "sat_fat_g": 0.5, "salt_g": 0.1,
           "fibre_g": 5, "protein_g": 9, "fruit_veg_nuts_pct": 0}


class FakeOFF:
    def __init__(self, result): self.result = result
    def fetch(self, barcode): return self.result


class FakeExtractor:
    def __init__(self, result): self.result = result
    def extract(self, image_bytes): return self.result


def build_client(off_result=None, extractor_result=None):
    engine = make_engine("sqlite://")
    init_db(engine)
    sf = make_session_factory(engine)
    app = create_app(session_factory=sf, off_client=FakeOFF(off_result),
                     label_extractor=FakeExtractor(extractor_result),
                     secret="test", guest_limit=3, free_limit=10, today="2026-05-31")
    return TestClient(app)


def _guest_headers(client):
    token = client.post("/auth/guest", json={"device_id": "d1"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_guest_auth_then_scan_off_hit():
    client = build_client(off_result={"name": "Chana", "brand": "Tata",
                                      "ingredients": ["chana"], "nutrition": HEALTHY})
    headers = _guest_headers(client)
    r = client.post("/scan/barcode", json={"barcode": "222"}, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["product"]["score"]["grade"] == "A"
    assert body["remaining"] == 2
    assert body["alternatives"] == []  # no other products seeded -> empty list present


def test_barcode_not_found_returns_404_needs_photo():
    client = build_client(off_result=None)
    headers = _guest_headers(client)
    r = client.post("/scan/barcode", json={"barcode": "999"}, headers=headers)
    assert r.status_code == 404
    assert r.json()["detail"]["needs_photo"] is True


def test_photo_scan_returns_score():
    client = build_client(extractor_result={"name": "Chips", "brand": "Lays",
                          "ingredients": ["potato", "palm oil"], "nutrition": HEALTHY})
    headers = _guest_headers(client)
    files = {"image": ("label.jpg", io.BytesIO(b"img"), "image/jpeg")}
    r = client.post("/scan/photo", data={"barcode": "444"}, files=files, headers=headers)
    assert r.status_code == 200
    assert r.json()["product"]["name"] == "Chips"


def test_rate_limit_blocks_after_quota():
    client = build_client(off_result={"name": "X", "brand": "Y",
                          "ingredients": ["a"], "nutrition": HEALTHY})
    headers = _guest_headers(client)
    for _ in range(3):
        client.post("/scan/barcode", json={"barcode": "222"}, headers=headers)
    # 222 is now cached (db hits still consume quota) -> 4th call blocked
    r = client.post("/scan/barcode", json={"barcode": "222"}, headers=headers)
    assert r.status_code == 429


def test_missing_auth_returns_401():
    client = build_client()
    r = client.post("/scan/barcode", json={"barcode": "222"})
    assert r.status_code == 401


def test_not_found_does_not_consume_quota():
    # An unknown product returns 404 needs_photo and must NOT burn the daily quota,
    # otherwise the user couldn't afford the follow-up photo. Guest limit is 3, so
    # five 404s in a row prove no quota was consumed (never a 429).
    client = build_client(off_result=None)
    headers = _guest_headers(client)
    for _ in range(5):
        r = client.post("/scan/barcode", json={"barcode": "999"}, headers=headers)
        assert r.status_code == 404


def test_failed_photo_extraction_does_not_consume_quota():
    from app.clients.label_extractor import ExtractionError

    class RaisingExtractor:
        def extract(self, image_bytes):
            raise ExtractionError("unreadable")

    engine = make_engine("sqlite://")
    init_db(engine)
    sf = make_session_factory(engine)
    app = create_app(session_factory=sf, off_client=FakeOFF(None),
                     label_extractor=RaisingExtractor(), secret="test",
                     guest_limit=3, free_limit=10, today="2026-05-31")
    client = TestClient(app)
    headers = _guest_headers(client)
    for _ in range(5):
        files = {"image": ("l.jpg", io.BytesIO(b"img"), "image/jpeg")}
        r = client.post("/scan/photo", data={"barcode": "444"}, files=files, headers=headers)
        assert r.status_code == 422


def test_google_login_route_issues_token():
    from unittest.mock import patch
    client = build_client()
    info = {"sub": "g-api", "email": "z@b.com", "name": "Zed", "picture": "http://x/z.png"}
    with patch("app.services.auth.google_id_token.verify_oauth2_token", return_value=info):
        r = client.post("/auth/google", json={"id_token": "fake"})
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "z@b.com"
    assert body["token"].startswith("user:")
    # The issued token authorizes a scan (counts against the free limit).
    headers = {"Authorization": f"Bearer {body['token']}"}
    assert client.post("/scan/barcode", json={"barcode": "x"},
                       headers=headers).status_code in (404, 200)


def test_google_login_route_rejects_bad_token():
    from unittest.mock import patch
    client = build_client()
    with patch("app.services.auth.google_id_token.verify_oauth2_token",
               side_effect=ValueError("bad")):
        r = client.post("/auth/google", json={"id_token": "bad"})
    assert r.status_code == 401


def test_unknown_then_photo_costs_one_scan():
    # The core flow: barcode unknown (404, free) -> photo succeeds (charged once).
    client = build_client(off_result=None,
                          extractor_result={"name": "Chips", "brand": "Lays",
                                            "ingredients": ["potato"], "nutrition": HEALTHY})
    headers = _guest_headers(client)
    assert client.post("/scan/barcode", json={"barcode": "444"},
                       headers=headers).status_code == 404
    files = {"image": ("l.jpg", io.BytesIO(b"img"), "image/jpeg")}
    r = client.post("/scan/photo", data={"barcode": "444"}, files=files, headers=headers)
    assert r.status_code == 200
    assert r.json()["remaining"] == 2


def _build_with_sf():
    engine = make_engine("sqlite://"); init_db(engine)
    sf = make_session_factory(engine)
    app = create_app(session_factory=sf, off_client=FakeOFF(None),
                     label_extractor=FakeExtractor(None), secret="test",
                     guest_limit=3, free_limit=10, today="2026-05-31")
    return TestClient(app), sf


def _seed_catalog(sf):
    from app.repositories.products import ProductRepository
    repo = ProductRepository(sf)
    def s(bc, cat, ov, gr, nm, br):
        repo.save(barcode=bc, name=nm, brand=br, category=cat, ingredients=[],
                  nutrition={"sugars_g": 1.0}, score={"overall": ov, "grade": gr, "breakdown": {}},
                  source="amazon")
    s("d1", "drinks", 88, "A", "Coconut Water", "Raw")
    s("d2", "drinks", 29, "D", "Cola", "Coke")
    s("n1", "namkeen", 82, "A", "Makhana", "Farmley")


def test_catalog_categories_lists_counts():
    client, sf = _build_with_sf(); _seed_catalog(sf)
    headers = _guest_headers(client)
    r = client.get("/catalog/categories", headers=headers)
    assert r.status_code == 200
    cats = r.json()["categories"]
    assert {"category": "drinks", "count": 2} in cats
    assert {"category": "namkeen", "count": 1} in cats


def test_catalog_products_filters_by_category_and_grade():
    client, sf = _build_with_sf(); _seed_catalog(sf)
    headers = _guest_headers(client)
    r = client.get("/catalog/products?category=drinks", headers=headers)
    body = r.json()
    assert body["total"] == 2
    assert [p["barcode"] for p in body["items"]] == ["d1", "d2"]
    r2 = client.get("/catalog/products?category=drinks&grade=A", headers=headers)
    assert [p["barcode"] for p in r2.json()["items"]] == ["d1"]


def test_catalog_products_search_query():
    client, sf = _build_with_sf(); _seed_catalog(sf)
    headers = _guest_headers(client)
    r = client.get("/catalog/products?q=cola", headers=headers)
    assert [p["barcode"] for p in r.json()["items"]] == ["d2"]


def test_catalog_requires_auth():
    client, _ = _build_with_sf()
    assert client.get("/catalog/categories").status_code == 401
    assert client.get("/catalog/products?category=drinks").status_code == 401
