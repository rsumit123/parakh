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
