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
