import pytest
from app.nutrition.foods import FOODS, per100g


@pytest.mark.parametrize("fid", list(FOODS))
def test_food_rows_are_internally_consistent(fid):
    f = FOODS[fid]
    # Atwater: 4 kcal/g protein & carbs, 9 kcal/g fat (fibre ~2) should explain kcal.
    est = 4 * f.protein + 4 * (f.carbs - f.fibre) + 2 * f.fibre + 9 * f.fat
    assert abs(est - f.kcal) / f.kcal <= 0.25, f"{fid}: macros give {est:.0f} kcal vs {f.kcal}"
    assert f.sugars <= f.carbs + 0.5, fid
    assert f.sat_fat <= f.fat + 0.5, fid
    assert f.min_g <= f.default_g <= f.max_g, fid
    if f.unit_g:
        assert f.unit_g > 0


def test_per100g_uses_app_keys_and_kj():
    p = per100g(FOODS["rice"])
    assert p["energy_kj"] == round(130 * 4.184, 1) and p["carbs_g"] == 28.0
    assert set(p) == {"energy_kj", "protein_g", "carbs_g", "fat_g", "fibre_g", "sugars_g", "sat_fat_g", "salt_g"}
