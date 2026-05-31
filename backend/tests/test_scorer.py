from app.scoring.scorer import score, grade_from_score

HEALTHY = {"energy_kj": 300, "sugars_g": 2, "sat_fat_g": 0.5, "salt_g": 0.1,
           "fibre_g": 5, "protein_g": 9, "fruit_veg_nuts_pct": 0}
JUNK = {"energy_kj": 2200, "sugars_g": 40, "sat_fat_g": 12, "salt_g": 1.5,
        "fibre_g": 0.5, "protein_g": 1, "fruit_veg_nuts_pct": 0}

def test_grade_bands():
    assert grade_from_score(90) == "A"
    assert grade_from_score(65) == "B"
    assert grade_from_score(45) == "C"
    assert grade_from_score(25) == "D"
    assert grade_from_score(10) == "E"

def test_healthy_scores_high():
    r = score(["roasted chana"], HEALTHY)
    assert r["overall"] >= 80
    assert r["grade"] == "A"
    assert r["verdict"] == "Good choice"

def test_junk_scores_low():
    r = score(["sugar", "maida", "palm oil"], JUNK)
    assert r["overall"] <= 25
    assert r["grade"] in ("D", "E")

def test_palm_oil_penalty_applied_and_flagged():
    base = score(["wheat flour"], HEALTHY)["overall"]
    penalized = score(["palm oil"], HEALTHY)
    assert penalized["overall"] < base
    assert any("palm" in f["label"].lower() for f in penalized["breakdown"]["india_flags"])

def test_maida_flagged():
    r = score(["maida"], HEALTHY)
    assert any("refined" in f["label"].lower() for f in r["breakdown"]["india_flags"])

def test_breakdown_contains_nutrient_bars():
    r = score(["x"], HEALTHY)
    keys = {n["key"] for n in r["breakdown"]["nutrients"]}
    assert {"sugars", "sat_fat", "salt", "fibre", "protein"} <= keys

def test_overall_clamped_0_100():
    r = score(["palm oil", "maida"], JUNK)
    assert 0 <= r["overall"] <= 100
