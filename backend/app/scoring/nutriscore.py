"""Pure implementation of the 2017 Nutri-Score points model for general foods.
Input is a per-100g nutrition dict; output is the integer nutri value
(lower = healthier), used as the backbone score before India penalties."""


def _points(value: float, thresholds: list[float]) -> int:
    """Return the index (0..len) of the first threshold `value` does NOT exceed."""
    for i, t in enumerate(thresholds):
        if value <= t:
            return i
    return len(thresholds)


_ENERGY = [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350]
_SUGAR = [4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45]
_SATFAT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
_SODIUM = [90, 180, 270, 360, 450, 540, 630, 720, 810, 900]  # mg
_FIBRE = [0.9, 1.9, 2.8, 3.7, 4.7]
_PROTEIN = [1.6, 3.2, 4.8, 6.4, 8.0]
_FRUIT = [40, 60, 80]  # percent; >80 -> 5 (handled below)


def nutri_value(nutrition: dict) -> int:
    g = lambda k: float(nutrition.get(k, 0) or 0)
    sodium_mg = g("salt_g") * 400.0  # salt_g -> sodium mg (salt = sodium*2.5)

    negative = (
        _points(g("energy_kj"), _ENERGY)
        + _points(g("sugars_g"), _SUGAR)
        + _points(g("sat_fat_g"), _SATFAT)
        + _points(sodium_mg, _SODIUM)
    )

    fibre_pts = _points(g("fibre_g"), _FIBRE)
    protein_pts = _points(g("protein_g"), _PROTEIN)
    fruit_pct = g("fruit_veg_nuts_pct")
    fruit_pts = 5 if fruit_pct > 80 else _points(fruit_pct, _FRUIT)

    # Standard rule: if negatives >= 11 and fruit points < 5, protein is excluded.
    if negative >= 11 and fruit_pts < 5:
        positive = fibre_pts + fruit_pts
    else:
        positive = fibre_pts + fruit_pts + protein_pts

    return negative - positive
