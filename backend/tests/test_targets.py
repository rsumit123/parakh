from app.nutrition.targets import compute_targets, summarize_day, MACRO_KEYS


def test_defaults_when_no_profile():
    t = compute_targets(None)
    assert t["protein_g"] == 50.0 and t["fibre_g"] == 30.0
    assert t["sugars_g"] == 50.0 and t["salt_g"] == 5.0 and t["sat_fat_g"] == 22.0
    assert 8000 < t["energy_kj"] < 8800  # ~2000 kcal
    assert set(t) == set(MACRO_KEYS)


def test_overrides_win_per_macro():
    t = compute_targets({"target_overrides": {"protein_g": 80, "sugars_g": 0, "x": 9}})
    assert t["protein_g"] == 80.0        # applied
    assert t["sugars_g"] == 50.0         # 0 ignored (must be > 0)
    assert t["fibre_g"] == 30.0          # untouched


def _entry(**kw):
    base = {k: 0.0 for k in MACRO_KEYS}
    base.update(kw)
    return base


def test_summary_totals_and_status():
    targets = compute_targets(None)
    entries = [_entry(protein_g=38, fibre_g=11, sugars_g=61, salt_g=4.1, sat_fat_g=14, energy_kj=6000)]
    s = summarize_day(entries, targets)
    assert s["totals"]["protein_g"] == 38
    assert s["status"]["protein_g"] == "low"   # hit nutrient under target
    assert s["status"]["fibre_g"] == "low"
    assert s["status"]["sugars_g"] == "over"   # limit nutrient over target
    assert s["status"]["salt_g"] == "ok"
    assert "low on fibre & protein" in s["headline"]
    assert "over on sugar" in s["headline"]


def test_empty_day_headline():
    s = summarize_day([], compute_targets(None))
    assert s["totals"]["protein_g"] == 0
    assert "Nothing logged" in s["headline"]


def test_on_track_headline():
    targets = compute_targets(None)
    entries = [_entry(protein_g=60, fibre_g=35, sugars_g=10, salt_g=1, sat_fat_g=5, energy_kj=3000)]
    s = summarize_day(entries, targets)
    assert s["status"]["protein_g"] == "ok" and s["status"]["fibre_g"] == "ok"
    assert "On track" in s["headline"]


def test_headline_multiple_lows_and_overs():
    targets = compute_targets(None)
    entries = [_entry(protein_g=10, fibre_g=5, sugars_g=80, sat_fat_g=40, salt_g=9, energy_kj=9000)]
    s = summarize_day(entries, targets)
    assert "low on fibre & protein" in s["headline"]
    assert "over on sugar, sat fat & salt" in s["headline"]


from app.nutrition.targets import personal_targets, is_personalised

_P = {"sex": "male", "age": 30, "weight_kg": 70.0, "height_cm": 175.0,
      "activity": "moderate", "goal": "maintain"}


def test_personal_targets_mifflin_st_jeor_maintain():
    t = personal_targets(_P)
    # BMR = 10*70 + 6.25*175 - 5*30 + 5 = 1648.75; x1.55 = 2555.6 -> 2556 kcal
    assert round(t["energy_kj"] / 4.184) == 2556
    assert t["protein_g"] == 58            # 0.83 g/kg, rounded
    assert t["fibre_g"] == 38              # 15 g per 1000 kcal
    assert t["sugars_g"] == 64             # 10% of energy / 4 kcal/g
    assert t["sat_fat_g"] == 28            # 10% of energy / 9 kcal/g
    assert t["salt_g"] == 5.0


def test_personal_targets_goal_and_sex_adjust():
    lose = personal_targets({**_P, "sex": "female", "goal": "lose"})
    # female BMR = 1648.75 - 166 = 1482.75; x1.55 = 2298 ; -500 = 1798 kcal
    assert round(lose["energy_kj"] / 4.184) == 1798
    assert lose["protein_g"] == 77         # 1.1 g/kg when losing (keeps muscle)
    gain = personal_targets({**_P, "goal": "gain"})
    assert round(gain["energy_kj"] / 4.184) == 2856


def test_energy_floor_on_aggressive_loss():
    t = personal_targets({**_P, "sex": "female", "age": 70, "weight_kg": 40.0,
                          "height_cm": 145.0, "activity": "sedentary", "goal": "lose"})
    assert round(t["energy_kj"] / 4.184) == 1200


def test_incomplete_profile_falls_back_to_defaults():
    assert personal_targets({**_P, "height_cm": None}) is None
    assert not is_personalised({**_P, "height_cm": None})
    assert is_personalised(_P)
    assert compute_targets({**_P, "height_cm": None})["energy_kj"] == 8368.0


def test_overrides_still_win_over_personal():
    t = compute_targets({**_P, "target_overrides": {"protein_g": 100}})
    assert t["protein_g"] == 100 and round(t["energy_kj"] / 4.184) == 2556
    base = compute_targets({**_P, "target_overrides": {"protein_g": 100}}, with_overrides=False)
    assert base["protein_g"] == 58


def test_carbs_and_fat_targets_are_shares_of_energy():
    d = compute_targets(None)
    assert d["carbs_g"] == 250.0 and d["fat_g"] == 67.0          # 2000 kcal: 50% / 30%
    p = personal_targets(_P)                                      # 2556 kcal
    assert p["carbs_g"] == 320 and p["fat_g"] == 85


def test_carbs_and_fat_are_informational_and_may_be_unknown():
    t = compute_targets(None)
    s = summarize_day([_entry(carbs_g=400.0, fat_g=None, protein_g=60.0, fibre_g=40.0),
                       _entry(carbs_g=None, fat_g=None, protein_g=0.0)], t)
    assert s["totals"]["carbs_g"] == 400.0 and s["totals"]["fat_g"] == 0.0
    assert s["status"]["carbs_g"] == "ok"            # never "over"/"low": no carb-shaming
    assert sorted(s["partial"]) == ["carbs_g", "fat_g"]
    assert "carb" not in s["headline"]
    full = summarize_day([_entry(carbs_g=10.0, fat_g=2.0)], t)
    assert full["partial"] == []
