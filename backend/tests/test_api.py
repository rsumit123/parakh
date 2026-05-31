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
