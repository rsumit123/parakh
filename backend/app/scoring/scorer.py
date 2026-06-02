"""Turns nutrition + ingredients into the final user-facing score:
Nutri-Score backbone -> 0-100, minus India-specific penalties, -> grade + breakdown.
Deterministic: same input always yields the same output."""
from app.scoring.nutriscore import nutri_value

# Nutri value ranges roughly -15 (best) .. 40 (worst). Map linearly to 0-100.
_NUTRI_BEST = -15
_NUTRI_WORST = 40

# India-specific ingredient penalties: (substring match, points, flag label, note)
_INDIA_PENALTIES = [
    ("palm oil", 10, "Palm oil", "Flagged for India market"),
    ("palmolein", 10, "Palm oil", "Listed as palmolein"),
    ("maida", 8, "Refined flour (maida)", "Refined wheat flour, low fibre"),
    ("refined wheat flour", 8, "Refined flour (maida)", "Refined wheat flour, low fibre"),
]
# Additive markers grouped by synonym so a single additive declared multiple ways
# isn't counted twice (e.g. "monosodium glutamate (MSG, E621)" is one additive).
# Each distinct group present adds a small penalty; the total is capped.
_ADDITIVE_GROUPS = [
    ("monosodium glutamate", "msg", "e621"),
    ("flavour enhancer", "flavor enhancer"),
    ("e635",),
    ("artificial colour", "artificial color"),
]
_ADDITIVE_POINTS = 3
_ADDITIVE_CAP = 9

# Strong NOVA-4 markers: cosmetic/industrial ingredients that on their own signal
# ultra-processing (flavours, colours, sweeteners, hydrogenated/industrial fats &
# syrups). A SINGLE one of these marks group 4.
_NOVA4_STRONG = [
    "flavour", "flavor", "artificial colour", "artificial color", "colour (",
    "color (", "monosodium glutamate", "msg", "hydrogenated", "invert syrup",
    "glucose syrup", "high fructose", "corn syrup", "sweetener", "maltodextrin",
    "protein isolate", "modified starch", "e621", "e635", "e150", "e160",
]
# Weak markers: common functional additives (a stabilizer/emulsifier/acidity
# regulator) that are fine alone — plain buttermilk has a stabilizer and is NOT
# ultra-processed. Two or more of these together do indicate ultra-processing.
_NOVA4_WEAK = [
    "emulsifier", "stabiliser", "stabilizer", "acidity regulator", "raising agent",
    "anti-caking", "preservative", "dextrose", "whey protein",
]


def _nova(ingredients: list[str]) -> dict:
    """Estimate the NOVA processing group (1-4) from the ingredient list.
    Informational (does not change the score). Group 4 needs real evidence: a strong
    cosmetic marker (flavour/colour/sweetener/...) OR two-plus weak functional
    additives. A lone stabilizer/emulsifier (e.g. plain buttermilk) is NOT group 4."""
    text = " ".join(i.lower() for i in ingredients)
    strong = any(m in text for m in _NOVA4_STRONG)
    weak_hits = sum(1 for m in _NOVA4_WEAK if m in text)
    if strong or weak_hits >= 2:
        return {"group": 4, "label": "Ultra-processed"}
    count = len([i for i in ingredients if i.strip()])
    if count == 0:
        return {"group": 0, "label": "Unknown"}
    if count >= 5:
        return {"group": 3, "label": "Processed"}
    return {"group": 1, "label": "Minimally processed"}


def grade_from_score(overall: int) -> str:
    if overall >= 80:
        return "A"
    if overall >= 60:
        return "B"
    if overall >= 40:
        return "C"
    if overall >= 20:
        return "D"
    return "E"


_VERDICTS = {
    "A": "Good choice", "B": "Good choice", "C": "Okay sometimes",
    "D": "Best limited", "E": "Best avoided",
}

# Nutrient bar config: (key, label, nutrition_key, high_is_bad, scale_max)
_BARS = [
    ("sugars", "Sugar", "sugars_g", True, 45),
    ("sat_fat", "Saturated fat", "sat_fat_g", True, 15),
    ("salt", "Salt", "salt_g", True, 3),
    ("fibre", "Fibre", "fibre_g", False, 8),
    ("protein", "Protein", "protein_g", False, 12),
]


def _base_0_100(nutrition: dict) -> int:
    nv = nutri_value(nutrition)
    nv = max(_NUTRI_BEST, min(_NUTRI_WORST, nv))
    span = _NUTRI_WORST - _NUTRI_BEST
    return round((_NUTRI_WORST - nv) / span * 100)


def _india_flags(ingredients: list[str]) -> tuple[int, list[dict]]:
    text = " ".join(i.lower() for i in ingredients)
    penalty = 0
    flags: list[dict] = []
    seen_labels: set[str] = set()
    for needle, pts, label, note in _INDIA_PENALTIES:
        if needle in text and label not in seen_labels:
            penalty += pts
            seen_labels.add(label)
            flags.append({"label": label, "note": note})
    additive_penalty = 0
    for group in _ADDITIVE_GROUPS:
        if any(marker in text for marker in group):
            additive_penalty = min(_ADDITIVE_CAP, additive_penalty + _ADDITIVE_POINTS)
    if additive_penalty:
        penalty += additive_penalty
        flags.append({"label": "Additives", "note": "Flavour enhancers / artificial additives"})
    return penalty, flags


def _nutrient_bars(nutrition: dict) -> list[dict]:
    g = lambda k: float(nutrition.get(k, 0) or 0)
    bars = []
    for key, label, nkey, high_is_bad, scale_max in _BARS:
        value = g(nkey)
        pct = max(0, min(100, round(value / scale_max * 100)))
        if high_is_bad:
            level = "high" if pct >= 60 else "ok" if pct >= 30 else "low"
        else:
            level = "high" if pct >= 50 else "ok" if pct >= 25 else "low"
        bars.append({"key": key, "label": label, "value_g": value,
                     "pct": pct, "level": level, "high_is_bad": high_is_bad})
    return bars


def _is_drink(category: str, ingredients: list[str]) -> bool:
    """True if the product is a beverage. Detected by category OR soda ingredients,
    so it works for seeded items (category set) and messy real scans alike."""
    c = (category or "").lower()
    # Malt / "health drink" POWDERS (Bournvita, Horlicks, Boost) are sold as powder
    # and consumed diluted — score them as food (per-100g), not per-100ml beverages.
    if "malt" in c or "health drink" in c:
        return False
    if "drink" in c:
        return True
    text = " ".join(i.lower() for i in ingredients)
    return "carbonated water" in text or "soft drink" in text


def _beverage_sugar_penalty(sugars_g: float) -> int:
    """Extra penalty for sugar in DRINKS only. The base score uses the food sugar
    scale, on which a sugary soda still scores deceptively well; beverages need a
    far harsher sugar response (real Nutri-Score uses a separate beverage scale).

    No penalty below 5g/100ml so naturally low-sugar drinks (plain buttermilk,
    lassi, milk — whose ~2g is intrinsic dairy lactose, not added sugar) are not
    punished. Calibrated so a full-sugar cola (~11g) lands D, a reduced-sugar drink
    (~7g) lands C, and zero/low-sugar drinks stay B."""
    s = sugars_g
    if s <= 5:
        return 0
    if s <= 8:
        return 20
    return 40


def score(ingredients: list[str], nutrition: dict, category: str = "") -> dict:
    base = _base_0_100(nutrition)
    penalty, india_flags = _india_flags(ingredients)
    overall = base - penalty

    drink_sugar_penalty = 0
    if _is_drink(category, ingredients):
        drink_sugar_penalty = _beverage_sugar_penalty(
            float(nutrition.get("sugars_g", 0) or 0))
        overall -= drink_sugar_penalty
    overall = max(0, min(100, overall))

    # The final grade is derived from the penalized 0-100 score, NOT the canonical
    # Nutri-Score A-E bands, so India penalties can move the letter grade.
    grade = grade_from_score(overall)

    bars = _nutrient_bars(nutrition)
    positives = [f"{b['label']} ({b['value_g']:g}g)"
                 for b in bars if (not b["high_is_bad"]) and b["level"] != "low"]
    negatives = [f"High {b['label'].lower()}"
                 for b in bars if b["high_is_bad"] and b["level"] == "high"]
    # Only label "High sugar" when the beverage penalty actually fired (sugar is
    # meaningfully high) — not for low-sugar drinks that incur no penalty.
    if drink_sugar_penalty > 0 and "High sugar" not in negatives:
        negatives.append("High sugar")
    negatives += [f["label"] for f in india_flags]

    return {
        "overall": overall,
        "grade": grade,
        "verdict": _VERDICTS[grade],
        "positives": positives,
        "negatives": negatives,
        "breakdown": {
            "nutrients": bars,
            "india_flags": india_flags,
            "nova": _nova(ingredients),
        },
    }
