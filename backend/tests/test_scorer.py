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

def test_msg_synonyms_counted_as_one_additive():
    # "monosodium glutamate" and "msg" are the same additive -> counted once,
    # so the penalty matches a single distinct marker.
    both = score(["monosodium glutamate", "msg"], HEALTHY)["overall"]
    one = score(["msg"], HEALTHY)["overall"]
    assert both == one

def test_empty_input_is_scored_without_error():
    r = score([], {})
    assert 0 <= r["overall"] <= 100
    assert r["grade"] in ("A", "B", "C", "D", "E")
    assert r["breakdown"]["india_flags"] == []

def test_nova_ultra_processed_when_additives_present():
    r = score(["corn meal", "palmolein", "flavour", "colour (160c)", "maltodextrin"], JUNK)
    assert r["breakdown"]["nova"]["group"] == 4
    assert r["breakdown"]["nova"]["label"] == "Ultra-processed"

def test_nova_minimally_processed_for_whole_food():
    r = score(["roasted chana"], HEALTHY)
    assert r["breakdown"]["nova"]["group"] == 1

def test_nova_unknown_when_no_ingredients():
    r = score([], HEALTHY)
    assert r["breakdown"]["nova"]["group"] == 0
    assert r["breakdown"]["nova"]["label"] == "Unknown"


# --- Beverage sugar penalty (drinks only) ---

COLA = {"energy_kj": 180, "sugars_g": 10.9, "sat_fat_g": 0, "salt_g": 0.01,
        "fibre_g": 0, "protein_g": 0, "fruit_veg_nuts_pct": 0}
ZERO_SODA = {"energy_kj": 0, "sugars_g": 0, "sat_fat_g": 0, "salt_g": 0.02,
             "fibre_g": 0, "protein_g": 0, "fruit_veg_nuts_pct": 0}
MID_SODA = {"energy_kj": 117, "sugars_g": 6.8, "sat_fat_g": 0, "salt_g": 0.02,
            "fibre_g": 0, "protein_g": 0, "fruit_veg_nuts_pct": 0}


def test_full_sugar_cola_grades_D_for_drinks():
    r = score(["carbonated water", "sugar"], COLA, category="drinks")
    assert r["grade"] == "D", r["overall"]
    assert "High sugar" in r["negatives"]


def test_zero_sugar_soda_stays_B():
    r = score(["carbonated water", "sweeteners"], ZERO_SODA, category="drinks")
    assert r["grade"] == "B", r["overall"]


def test_reduced_sugar_drink_lands_between():
    r = score(["carbonated water", "sweeteners"], MID_SODA, category="drinks")
    assert r["grade"] == "C", r["overall"]


def test_beverage_penalty_only_applies_to_drinks():
    # The SAME sugar in a non-drink (no category, no soda ingredients) must NOT get
    # the harsh beverage penalty.
    as_food = score(["wheat flour"], COLA)
    as_drink = score(["carbonated water"], COLA, category="drinks")
    assert as_food["overall"] > as_drink["overall"]


def test_drink_detected_by_ingredients_when_category_missing():
    # No category, but carbonated water in ingredients -> still treated as a drink.
    r = score(["carbonated water", "sugar"], COLA)
    assert r["grade"] == "D"


# --- Low-sugar dairy drinks (buttermilk/lassi/milk) regression: the bugs the user
#     spotted — a "High sugar" warning + ultra-processed flag + being out-ranked by
#     diet soda on plain chaas. ---

BUTTERMILK = {"energy_kj": 121, "sugars_g": 1.8, "sat_fat_g": 1.0, "salt_g": 0.625,
              "fibre_g": 0, "protein_g": 1.5, "fruit_veg_nuts_pct": 0}


def test_buttermilk_no_false_high_sugar_warning():
    # 1.8g (natural dairy lactose) is LOW -> no beverage penalty, no "High sugar".
    r = score(["milk solids", "iodised salt", "stabilizer (460i)"], BUTTERMILK,
              category="drinks")
    assert "High sugar" not in r["negatives"], r["negatives"]


def test_buttermilk_not_ultra_processed():
    # A lone stabilizer must NOT make plain buttermilk NOVA group 4.
    r = score(["milk solids", "iodised salt", "spices & condiments", "stabilizer (460i)"],
              BUTTERMILK, category="drinks")
    assert r["breakdown"]["nova"]["group"] != 4, r["breakdown"]["nova"]


def test_buttermilk_and_zero_soda_are_same_grade():
    # Plain chaas must not be dragged below a diet cola. Both land "B"; whether a
    # same-grade soda is suggested as an "alternative" is enforced in the repository
    # (better-grade rule), not here.
    bm = score(["milk solids", "iodised salt", "stabilizer (460i)"], BUTTERMILK,
               category="drinks")
    cola_zero = score(["carbonated water", "sweeteners (955, 950)"], ZERO_SODA,
                      category="drinks")
    assert bm["grade"] == cola_zero["grade"] == "B"


def test_two_weak_additives_still_flag_ultra_processed():
    # emulsifier + preservative together (no lone-additive escape) -> group 4.
    r = score(["wheat flour", "emulsifier", "preservative"], JUNK)
    assert r["breakdown"]["nova"]["group"] == 4
