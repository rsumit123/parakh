import json
from app.services.meal_estimator import MealEstimator, MealEstimateError


class _Resp:
    status_code = 200
    def __init__(self, content): self._c = content
    def json(self): return {"choices": [{"message": {"content": self._c}}]}


def test_parses_estimate(monkeypatch):
    payload = json.dumps({"name": "Dal rice", "portion_g": 350,
        "nutrition": {"energy_kj": 500, "sugars_g": 2, "sat_fat_g": 1, "salt_g": 0.3,
                      "fibre_g": 2, "protein_g": 4}})
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp(payload))
    est = MealEstimator(api_key="k", model="m", url="u").estimate(b"jpegbytes")
    assert est["name"] == "Dal rice" and est["portion_g"] == 350.0
    assert est["per100g"]["protein_g"] == 4.0
    assert set(est["per100g"]) == {"energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g"}


def test_raises_on_bad_json(monkeypatch):
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp("not json"))
    try:
        MealEstimator(api_key="k", model="m", url="u").estimate(b"x")
        assert False
    except MealEstimateError:
        pass


def test_clamps_absurd_drink_portion(monkeypatch):
    payload = json.dumps({"name": "Mango Lassi", "portion_g": 1000,
        "nutrition": {"energy_kj": 300, "sugars_g": 13, "sat_fat_g": 2, "salt_g": 0.1,
                      "fibre_g": 0, "protein_g": 4}})
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp(payload))
    est = MealEstimator(api_key="k", model="m", url="u").estimate(b"x")
    assert est["portion_g"] == 250.0  # 1000 g jug -> typical glass


def test_keeps_reasonable_portion(monkeypatch):
    payload = json.dumps({"name": "Chana Masala", "portion_g": 220,
        "nutrition": {"energy_kj": 480, "sugars_g": 4, "sat_fat_g": 1, "salt_g": 0.6,
                      "fibre_g": 8, "protein_g": 7}})
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp(payload))
    est = MealEstimator(api_key="k", model="m", url="u").estimate(b"x")
    assert est["portion_g"] == 220  # within curry bounds, untouched
