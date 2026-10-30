from app.nutrition.gaps import close_gaps
from app.nutrition.foods import FOODS, per100g

T = {"energy_kj": 2660 * 4.184, "protein_g": 110.0, "fibre_g": 53.0, "sugars_g": 67.0, "sat_fat_g": 30.0,
     "salt_g": 5.0, "carbs_g": 333.0, "fat_g": 89.0}


def _totals(kcal, protein, fibre, sugar=20.0, sat=15.0, salt=3.0):
    return {"energy_kj": kcal * 4.184, "protein_g": protein, "fibre_g": fibre, "sugars_g": sugar,
            "sat_fat_g": sat, "salt_g": salt, "carbs_g": 0.0, "fat_g": 0.0}


def _own(name, food_id, grams, uses=3):
    return {"name": name, "quantity_g": grams, "per100g": per100g(FOODS[food_id]), "uses": uses, "kind": "manual"}


def test_no_ideas_when_on_target():
    r = close_gaps(_totals(2000, 112, 50), T, [])
    assert r["ideas"] == [] and r["gaps"] == {}       # fibre 3 g short: not worth a nudge


def test_prefers_your_own_regular_foods_and_closes_both_gaps():
    own = [_own("Boiled eggs ×2", "boiled_egg", 100), _own("Gulab jamun", "gulab_jamun", 80, uses=5)]
    r = close_gaps(_totals(1760, 80, 22), T, own)
    assert r["gaps"] == {"protein_g": 30, "fibre_g": 31} and r["kcal_left"] == 900
    names = [i["name"] for i in r["ideas"]]
    assert names[0] == "Boiled eggs ×2" and r["ideas"][0]["own"] is True
    assert "Boiled Egg ×2" not in names                  # no duplicate of your own eggs
    assert "Gulab jamun" not in names                    # adds no protein/fibre
    assert any(i["fibre_g"] >= 5 for i in r["ideas"])    # a later idea covers fibre
    assert 1 <= len(names) <= 3


def test_respects_calories_left_and_limits():
    # over calories already and at the sat-fat limit: only light, lean ideas
    r = close_gaps(_totals(2900, 60, 40, sat=30.0), T, [_own("Paneer sabzi", "paneer_sabzi", 150)])
    assert r["ideas"], r
    assert all(i["kcal"] <= 250 for i in r["ideas"])
    assert all(i["name"] != "Paneer sabzi" for i in r["ideas"])   # would break the sat-fat limit


def test_one_off_foods_are_not_regulars():
    r = close_gaps(_totals(1500, 60, 40), T, [_own("Soya chaap", "soya_chunks_curry", 150, uses=1)])
    assert all(i["name"] != "Soya chaap" for i in r["ideas"])
