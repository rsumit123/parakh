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
# Additive markers each add a smaller penalty (capped).
_ADDITIVE_MARKERS = ["flavour enhancer", "flavor enhancer", "e621", "e635",
                     "monosodium glutamate", "msg", "artificial colour", "artificial color"]
_ADDITIVE_POINTS = 3
_ADDITIVE_CAP = 9


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
    for marker in _ADDITIVE_MARKERS:
        if marker in text:
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


def score(ingredients: list[str], nutrition: dict) -> dict:
    base = _base_0_100(nutrition)
    penalty, india_flags = _india_flags(ingredients)
    overall = max(0, min(100, base - penalty))
    grade = grade_from_score(overall)

    bars = _nutrient_bars(nutrition)
    positives = [f"{b['label']} ({b['value_g']:g}g)"
                 for b in bars if (not b["high_is_bad"]) and b["level"] != "low"]
    negatives = [f"High {b['label'].lower()}"
                 for b in bars if b["high_is_bad"] and b["level"] == "high"]
    negatives += [f["label"] for f in india_flags]

    return {
        "overall": overall,
        "grade": grade,
        "verdict": _VERDICTS[grade],
        "positives": positives,
        "negatives": negatives,
        "breakdown": {"nutrients": bars, "india_flags": india_flags},
    }
