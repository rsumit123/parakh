import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository
from app.scoring.scorer import score as score_fn


class _OFF:
    def fetch(self, barcode): return None


class _Extractor:
    def extract(self, b): raise RuntimeError("unused")


class _Estimator:
    def estimate(self, image_bytes):
        return {"name": "Dal rice", "portion_g": 350.0,
                "per100g": {"energy_kj": 500, "sugars_g": 2, "sat_fat_g": 1,
                            "salt_g": 0.3, "fibre_g": 2, "protein_g": 4}}


@pytest.fixture
def client_and_sf():
    engine = make_engine("sqlite://")
    sf = make_session_factory(engine)
    init_db(engine)
    repo = ProductRepository(sf)
    nutrition = {"energy_kj": 360, "sugars_g": 14.5, "sat_fat_g": 1.25, "salt_g": 0.075,
                 "fibre_g": 0, "protein_g": 2.1, "fruit_veg_nuts_pct": 0}
    repo.save(barcode="b1", name="Amul Lassi", brand="Amul", category="dairy",
              ingredients=["milk"], nutrition=nutrition,
              score=score_fn(["milk"], nutrition, "dairy"), source="amazon")
    app = create_app(session_factory=sf, off_client=_OFF(), label_extractor=_Extractor(),
                     meal_estimator=_Estimator(), secret="s", guest_limit=3, free_limit=10,
                     today="2026-06-13")
    return TestClient(app), sf


def _guest_token(c):
    return c.post("/auth/guest", json={"device_id": "d1"}).json()["token"]


def _user_headers(secret="s"):
    import hmac, hashlib
    payload = "user:1"
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return {"Authorization": f"Bearer {payload}.{sig}"}


def test_diet_requires_signed_in_user(client_and_sf):
    c, _ = client_and_sf
    g = _guest_token(c)
    r = c.get("/diet/day", headers={"Authorization": f"Bearer {g}"})
    assert r.status_code == 401


def test_log_packaged_computes_macros_from_product(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    r = c.post("/diet/log", headers=h, json={"kind": "packaged", "barcode": "b1",
               "name": "Amul Lassi", "brand": "Amul", "quantity_g": 200})
    assert r.status_code == 200
    body = r.json()
    assert round(body["entry"]["sugars_g"], 1) == 29.0
    assert body["totals"]["sugars_g"] == body["entry"]["sugars_g"]
    assert body["status"]["sugars_g"] in ("ok", "over")
    assert "headline" in body


def test_estimate_returns_dish_and_per100g(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    r = c.post("/diet/estimate", headers=h,
               files={"image": ("m.jpg", b"jpegbytes", "image/jpeg")})
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Dal rice" and body["per100g"]["protein_g"] == 4
    assert "grade" in body


def test_log_unpackaged_uses_supplied_per100g_then_day_and_delete(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    per = {"energy_kj": 500, "sugars_g": 2, "sat_fat_g": 1, "salt_g": 0.3, "fibre_g": 2, "protein_g": 4}
    r = c.post("/diet/log", headers=h, json={"kind": "unpackaged", "name": "Dal rice",
               "quantity_g": 350, "per100g": per})
    eid = r.json()["entry"]["id"]
    assert round(r.json()["entry"]["protein_g"], 1) == 14.0
    day = c.get("/diet/day?date=2026-06-13", headers=h).json()
    assert len(day["entries"]) == 1 and day["targets"]["protein_g"] == 50.0
    d = c.delete(f"/diet/log/{eid}", headers=h)
    assert d.status_code == 200 and d.json()["totals"]["protein_g"] == 0
