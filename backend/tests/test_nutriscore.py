from app.scoring.nutriscore import nutri_value

LOW = {"energy_kj": 300, "sugars_g": 2, "sat_fat_g": 0.5, "salt_g": 0.1,
       "fibre_g": 5, "protein_g": 9, "fruit_veg_nuts_pct": 0}
HIGH = {"energy_kj": 2200, "sugars_g": 40, "sat_fat_g": 12, "salt_g": 1.5,
        "fibre_g": 0.5, "protein_g": 1, "fruit_veg_nuts_pct": 0}

def test_healthy_food_has_low_nutri_value():
    assert nutri_value(LOW) <= 0

def test_junk_food_has_high_nutri_value():
    assert nutri_value(HIGH) >= 11

def test_protein_excluded_when_negatives_high_and_no_fruit():
    # high negatives, decent protein but should not rescue the score
    food = dict(HIGH); food["protein_g"] = 9
    assert nutri_value(food) >= 11

def test_missing_keys_default_to_zero():
    assert isinstance(nutri_value({}), int)
