from app.nutrition.targets import compute_targets, summarize_day, MACRO_KEYS


def test_defaults_when_no_profile():
    t = compute_targets(None)
    assert t["protein_g"] == 50.0 and t["fibre_g"] == 40.0   # ICMR: 40 g / 2000 kcal
    assert t["sugars_g"] == 50.0 and t["salt_g"] == 5.0 and t["sat_fat_g"] == 22.0
    assert 8000 < t["energy_kj"] < 8800  # ~2000 kcal
    assert set(t) == set(MACRO_KEYS)


def test_overrides_win_per_macro():
    t = compute_targets({"target_overrides": {"protein_g": 80, "sugars_g": 0, "x": 9}})
    assert t["protein_g"] == 80.0        # applied
    assert t["sugars_g"] == 50.0         # 0 ignored (must be > 0)
    assert t["fibre_g"] == 40.0          # untouched


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
    entries = [_entry(protein_g=60, fibre_g=42, sugars_g=10, salt_g=1, sat_fat_g=5, energy_kj=3000)]
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


def test_personal_targets_icmr_maintain():
    t = personal_targets(_P)
    # ICMR-NIN: BMR = (11.472*70 + 873.1) * 0.90 = 1508.5 (age 30-60); x1.8 = 2715 kcal
    assert round(t["energy_kj"] / 4.184) == 2715
    assert t["protein_g"] == 58            # 0.83 g/kg, rounded
    assert t["fibre_g"] == 54              # ICMR: 40 g per 2000 kcal
    assert t["sugars_g"] == 68             # 10% of energy / 4 kcal/g
    assert t["sat_fat_g"] == 30            # 10% of energy / 9 kcal/g
    assert t["salt_g"] == 5.0


def test_personal_targets_goal_and_sex_adjust():
    lose = personal_targets({**_P, "sex": "female", "goal": "lose"})
    # female BMR = (8.126*70 + 845.6) * 0.91 = 1287.1; x1.8 = 2317 ; -500 = 1817 kcal
    assert round(lose["energy_kj"] / 4.184) == 1817
    assert lose["protein_g"] == 77         # 1.1 g/kg when losing (keeps muscle)
    gain = personal_targets({**_P, "goal": "gain"})
    assert round(gain["energy_kj"] / 4.184) == 3015


def test_energy_floor_on_aggressive_loss():
    t = personal_targets({**_P, "sex": "female", "age": 70, "weight_kg": 40.0,
                          "height_cm": 145.0, "activity": "sedentary", "goal": "lose"})
    assert round(t["energy_kj"] / 4.184) == 1200


def test_incomplete_profile_falls_back_to_defaults():
    assert personal_targets({**_P, "height_cm": None}) is None
    assert not is_personalised({**_P, "height_cm": None})
    assert is_personalised(_P)
    # missing height is assumed rather than falling back to generic (ICMR energy ignores it)
    est = compute_targets({**_P, "height_cm": None})
    assert round(est["energy_kj"] / 4.184) == 2715


def test_overrides_still_win_over_personal():
    t = compute_targets({**_P, "target_overrides": {"protein_g": 100}})
    assert t["protein_g"] == 100 and round(t["energy_kj"] / 4.184) == 2715
    base = compute_targets({**_P, "target_overrides": {"protein_g": 100}}, with_overrides=False)
    assert base["protein_g"] == 58


def test_carbs_and_fat_targets_are_shares_of_energy():
    d = compute_targets(None)
    assert d["carbs_g"] == 250.0 and d["fat_g"] == 67.0          # 2000 kcal: 50% / 30%
    p = personal_targets(_P)                                      # 2715 kcal
    assert p["carbs_g"] == 339 and p["fat_g"] == 91


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


def test_partial_profile_estimates_with_assumptions():
    from app.nutrition.targets import targets_basis
    # the owner's real case: everything but age -> age 30 assumed
    p = {"sex": "male", "height_cm": 180, "weight_kg": 67, "activity": "light", "goal": "maintain"}
    assert targets_basis(p) == "estimated"
    t = compute_targets(p)
    # (11.472*67 + 873.1) * 0.90 = 1477.6 ; x1.6 = 2364
    assert round(t["energy_kj"] / 4.184) == 2364 and t["protein_g"] == 56


def test_single_choice_moves_targets():
    base = compute_targets({})
    very = compute_targets({"activity": "active"})
    lose = compute_targets({"goal": "lose"})
    assert base["energy_kj"] == 8368.0                    # nothing set: generic default
    assert very["energy_kj"] > base["energy_kj"] > lose["energy_kj"]


def test_matches_icmr_reference_adults():
    # ICMR-NIN 2020 Table 1b: 65 kg man 2110 / 2710 / 3470, 55 kg woman 1660 kcal (to 10 kcal)
    man = {"sex": "male", "age": 25, "weight_kg": 65.0, "height_cm": 170.0, "goal": "maintain"}
    kcal = lambda p: round(personal_targets(p)["energy_kj"] / 4.184)
    got = [kcal({**man, "activity": a}) for a in ("sedentary", "moderate", "active")]
    assert all(abs(g - want) <= 12 for g, want in zip(got, (2110, 2710, 3470))), got
    assert abs(kcal({**man, "sex": "female", "weight_kg": 55.0, "activity": "sedentary"}) - 1660) <= 12
    assert personal_targets({**man, "activity": "sedentary"})["protein_g"] == 54


def test_basis_values():
    from app.nutrition.targets import targets_basis
    assert targets_basis(None) == "default" and targets_basis({"target_overrides": {}}) == "default"
    assert targets_basis(_P) == "calculated"
