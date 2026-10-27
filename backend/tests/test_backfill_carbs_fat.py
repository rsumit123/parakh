from scripts.backfill_carbs_fat import plausible

BISCUIT = {"energy_kj": 2030, "protein_g": 7, "fibre_g": 2}   # ~485 kcal


def test_accepts_values_that_explain_the_energy():
    assert plausible(68, 20, BISCUIT)            # 17*68+37*20+17*7+8*2 = 2031 kJ


def test_rejects_misreads():
    assert not plausible(22, 6, BISCUIT)         # per-serving values read as per-100 g
    assert not plausible(None, 20, BISCUIT)
    assert not plausible(80, 30, BISCUIT)        # > 100 g of macros per 100 g
    assert not plausible(68, 20, {"energy_kj": 0})


def test_near_zero_calorie_drinks_use_absolute_check():
    assert plausible(0.5, 0, {"energy_kj": 10, "protein_g": 0})
    assert not plausible(10, 0, {"energy_kj": 10, "protein_g": 0})
