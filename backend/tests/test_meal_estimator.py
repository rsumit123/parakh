import json
import pytest
from app.services.meal_estimator import MealEstimator, MealEstimateError


class _Resp:
    status_code = 200
    def __init__(self, content): self._c = content
    def json(self): return {"choices": [{"message": {"content": self._c}}]}


def test_raises_on_bad_json(monkeypatch):
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp("not json"))
    try:
        MealEstimator(api_key="k", model="m", url="u").estimate(b"x")
        assert False
    except MealEstimateError:
        pass


def test_parses_single_item(monkeypatch):
    payload = json.dumps({"items": [{"name": "Dal Tadka", "portion_g": 200,
        "nutrition": {"energy_kj": 480, "sugars_g": 1, "sat_fat_g": 2, "salt_g": 0.5,
                      "fibre_g": 8, "protein_g": 9}}]})
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp(payload))
    out = MealEstimator(api_key="k", model="m", url="u").estimate(b"x")
    assert len(out["items"]) == 1
    it = out["items"][0]
    assert it["name"] == "Dal Tadka" and it["portion_g"] == 200
    assert set(it["per100g"]) == {"energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g",
                                  "carbs_g", "fat_g"}
    assert it["per100g"]["carbs_g"] is None   # not given by the model -> unknown


def test_parses_multi_item_thali(monkeypatch):
    payload = json.dumps({"items": [
        {"name": "Dal", "portion_g": 200, "nutrition": {"energy_kj": 480, "sugars_g": 1,
            "sat_fat_g": 2, "salt_g": 0.5, "fibre_g": 8, "protein_g": 9}},
        {"name": "Jeera Rice", "portion_g": 250, "nutrition": {"energy_kj": 540, "sugars_g": 0,
            "sat_fat_g": 1, "salt_g": 0.3, "fibre_g": 2, "protein_g": 4}},
    ]})
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp(payload))
    out = MealEstimator(api_key="k", model="m", url="u").estimate(b"x")
    assert [i["name"] for i in out["items"]] == ["Dal", "Jeera Rice"]
    assert out["items"][1]["portion_g"] == 250


def test_clamps_absurd_portion_per_item(monkeypatch):
    payload = json.dumps({"items": [{"name": "Mango Lassi", "portion_g": 1000,
        "nutrition": {"energy_kj": 300, "sugars_g": 13, "sat_fat_g": 2, "salt_g": 0.1,
                      "fibre_g": 0, "protein_g": 4}}]})
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp(payload))
    out = MealEstimator(api_key="k", model="m", url="u").estimate(b"x")
    assert out["items"][0]["portion_g"] == 250.0  # drink clamp


def test_wraps_legacy_single_object(monkeypatch):
    payload = json.dumps({"name": "Paneer Tikka", "portion_g": 180,
        "nutrition": {"energy_kj": 900, "sugars_g": 3, "sat_fat_g": 6, "salt_g": 0.8,
                      "fibre_g": 1, "protein_g": 20}})
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp(payload))
    out = MealEstimator(api_key="k", model="m", url="u").estimate(b"x")
    assert len(out["items"]) == 1 and out["items"][0]["name"] == "Paneer Tikka"


def test_empty_items_raises(monkeypatch):
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp('{"items": []}'))
    with pytest.raises(MealEstimateError):
        MealEstimator(api_key="k", model="m", url="u").estimate(b"x")


def test_all_zero_nutrition_raises(monkeypatch):
    payload = json.dumps({"items": [{"name": "Almonds", "portion_g": 30, "nutrition": {}}]})
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp(payload))
    with pytest.raises(MealEstimateError):
        MealEstimator(api_key="k", model="m", url="u").estimate(b"x")


def test_dry_fruit_portion_is_a_handful(monkeypatch):
    payload = json.dumps({"items": [{"name": "Mixed Dry Fruits", "portion_g": 500,
        "nutrition": {"energy_kj": 2400, "sugars_g": 20, "sat_fat_g": 4, "salt_g": 0,
                      "fibre_g": 9, "protein_g": 15}}]})
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp(payload))
    out = MealEstimator(api_key="k", model="m", url="u").estimate(b"x")
    assert out["items"][0]["portion_g"] == 30  # 500 g is a whole bag, snapped to a handful


def test_small_thali_helping_not_inflated(monkeypatch):
    payload = json.dumps({"items": [{"name": "Aloo Sabzi", "portion_g": 70,
        "nutrition": {"energy_kj": 400, "sugars_g": 2, "sat_fat_g": 2, "salt_g": 0.5,
                      "fibre_g": 3, "protein_g": 3}}]})
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp(payload))
    out = MealEstimator(api_key="k", model="m", url="u").estimate(b"x")
    assert out["items"][0]["portion_g"] == 70  # survives (default min lowered to 15)


def test_garnish_items_are_dropped(monkeypatch):
    n = {"energy_kj": 400, "sugars_g": 1, "sat_fat_g": 1, "salt_g": 0.5, "fibre_g": 2, "protein_g": 5}
    payload = json.dumps({"items": [{"name": "Fish Curry", "portion_g": 200, "nutrition": n},
                                    {"name": "Red Chilli Flakes", "portion_g": 200, "nutrition": n},
                                    {"name": "Lime Wedge", "portion_g": 10, "nutrition": n},
                                    {"name": "Chilli Chicken", "portion_g": 200, "nutrition": n}]})
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp(payload))
    out = MealEstimator(api_key="k", model="m", url="u").estimate(b"x")
    assert [i["name"] for i in out["items"]] == ["Fish Curry", "Chilli Chicken"]


def test_parses_carbs_and_fat(monkeypatch):
    payload = json.dumps({"items": [{"name": "Poha", "portion_g": 150,
        "nutrition": {"energy_kj": 600, "sugars_g": 2, "sat_fat_g": 1, "salt_g": 0.5,
                      "fibre_g": 2, "protein_g": 3, "carbs_g": 25, "fat_g": 5}}]})
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp(payload))
    it = MealEstimator(api_key="k", model="m", url="u").estimate(b"x")["items"][0]
    assert it["per100g"]["carbs_g"] == 25 and it["per100g"]["fat_g"] == 5


def _run(monkeypatch, items):
    monkeypatch.setattr("app.services.meal_estimator.httpx.post",
                        lambda *a, **k: _Resp(json.dumps({"items": items})))
    return MealEstimator(api_key="k", model="m", url="u").estimate(b"x")["items"]


def test_known_food_counts_become_grams_and_table_nutrition(monkeypatch):
    out = _run(monkeypatch, [{"food": "roti", "name": "Chapati", "count": 3},
                             {"food": "boiled_egg", "count": 2}])
    roti, egg = out
    assert roti["name"] == "Chapati" and roti["portion_g"] == 120 and roti["count"] == 3
    assert roti["food_id"] == "roti" and roti["per100g"]["carbs_g"] == 46.0
    assert egg["name"] == "Boiled Egg" and egg["portion_g"] == 100


def test_known_food_grams_are_clamped_and_defaulted(monkeypatch):
    out = _run(monkeypatch, [{"food": "dal_tadka", "grams": 1000},
                             {"food": "rice"},
                             {"food": "curd", "grams": 150}])
    assert [i["portion_g"] for i in out] == [450, 200, 150]


def test_nuts_counted_by_piece(monkeypatch):
    out = _run(monkeypatch, [{"food": "almonds", "count": 4}, {"food": "raisins", "count": 5}])
    assert out[0]["portion_g"] == 4.8 and out[1]["portion_g"] == 2.5


def test_unknown_food_falls_back_to_model_nutrition(monkeypatch):
    n = {"energy_kj": 800, "protein_g": 5, "carbs_g": 20, "fat_g": 8, "fibre_g": 1,
         "sugars_g": 2, "sat_fat_g": 2, "salt_g": 1}
    out = _run(monkeypatch, [{"food": "other", "name": "Litti Chokha", "grams": 150, "nutrition": n}])
    assert out[0]["name"] == "Litti Chokha" and out[0]["portion_g"] == 150
    assert out[0]["per100g"]["energy_kj"] == 800 and "food_id" not in out[0]


def test_prompt_lists_food_ids():
    from app.services.meal_estimator import _prompt
    p = _prompt()
    assert "dal_tadka" in p and "roti (per piece)" in p and "Do NOT shrink portions" in p


def test_json_wrapped_in_code_fences_is_accepted(monkeypatch):
    fenced = "```json\n" + json.dumps({"items": [{"food": "rice", "grams": 150}]}) + "\n```"
    monkeypatch.setattr("app.services.meal_estimator.httpx.post", lambda *a, **k: _Resp(fenced))
    out = MealEstimator(api_key="k", model="m", url="u").estimate(b"x")["items"]
    assert out[0]["portion_g"] == 150
