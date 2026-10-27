"""Pure daily-target math for diet tracking. No DB, no clock — callers pass data in.

Two nutrient roles:
- HIT  (protein, fibre): being UNDER the target is the problem -> status "low".
- LIMIT (energy, sugar, sat-fat, salt): being OVER is the problem -> status "over".
"""
MACRO_KEYS = ("energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g")
HIT = ("protein_g", "fibre_g")
LIMIT = ("energy_kj", "sugars_g", "sat_fat_g", "salt_g")

# Conservative adult guideline defaults (unisex). energy ~2000 kcal in kJ.
_DEFAULTS = {
    "energy_kj": 8368.0, "protein_g": 50.0, "fibre_g": 30.0,
    "sugars_g": 50.0, "sat_fat_g": 22.0, "salt_g": 5.0,
}
# Nutrients named in the headline (energy intentionally excluded — no calorie-shaming).
_HEADLINE_LOW = ("fibre_g", "protein_g")
_HEADLINE_OVER = ("sugars_g", "sat_fat_g", "salt_g")
_LABELS = {"energy_kj": "energy", "protein_g": "protein", "fibre_g": "fibre",
           "sugars_g": "sugar", "sat_fat_g": "sat fat", "salt_g": "salt"}


# Personal targets from an "About you" profile.
_ACTIVITY = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "active": 1.725}
_GOAL_KCAL = {"lose": -500, "maintain": 0, "gain": 300}
_PROTEIN_G_PER_KG = {"lose": 1.1, "maintain": 0.83, "gain": 1.1}  # 0.83 = ICMR-NIN adult RDA
_MIN_KCAL = 1200
_KJ_PER_KCAL = 4.184


def is_personalised(profile: dict | None) -> bool:
    p = profile or {}
    return (p.get("sex") in ("male", "female") and bool(p.get("age"))
            and bool(p.get("weight_kg")) and bool(p.get("height_cm"))
            and p.get("activity") in _ACTIVITY and p.get("goal") in _GOAL_KCAL)


def personal_targets(profile: dict | None) -> dict | None:
    """Targets from body + lifestyle, or None if the profile is incomplete.

    Energy: Mifflin-St Jeor BMR x activity factor, +/- for the goal (floored).
    Protein: g per kg body weight. Fibre: 15 g per 1000 kcal. Sugar and sat fat:
    each under 10% of energy (WHO). Salt: 5 g (WHO), independent of size."""
    if not is_personalised(profile):
        return None
    p = profile or {}
    w, h, age = float(p["weight_kg"]), float(p["height_cm"]), float(p["age"])
    bmr = 10 * w + 6.25 * h - 5 * age + (5 if p["sex"] == "male" else -161)
    kcal_day = round(max(_MIN_KCAL, bmr * _ACTIVITY[p["activity"]] + _GOAL_KCAL[p["goal"]]))
    return {
        "energy_kj": kcal_day * _KJ_PER_KCAL,
        "protein_g": float(round(w * _PROTEIN_G_PER_KG[p["goal"]])),
        "fibre_g": float(round(kcal_day * 15 / 1000)),
        "sugars_g": float(round(kcal_day * 0.10 / 4)),
        "sat_fat_g": float(round(kcal_day * 0.10 / 9)),
        "salt_g": 5.0,
    }


def compute_targets(profile: dict | None = None, with_overrides: bool = True) -> dict:
    """Return the 6 daily targets: personal ones when the profile is complete, else
    smart defaults; explicit per-macro overrides win (unless with_overrides=False)."""
    targets = personal_targets(profile) or dict(_DEFAULTS)
    if not with_overrides:
        return targets
    overrides = ((profile or {}).get("target_overrides")) or {}
    for k in MACRO_KEYS:
        v = overrides.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0:
            targets[k] = float(v)
    return targets


def _status_for(macro: str, consumed: float, target: float) -> str:
    if macro in HIT:
        return "low" if consumed < target else "ok"
    return "over" if consumed > target else "ok"


def _join(names: list[str]) -> str:
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} & {names[1]}"
    return ", ".join(names[:-1]) + " & " + names[-1]


def _headline(lows: list[str], overs: list[str], has_entries: bool) -> str:
    if not has_entries:
        return "Nothing logged yet — add your first food."
    parts = []
    if lows:
        parts.append("low on " + _join(lows))
    if overs:
        parts.append("over on " + _join(overs))
    if not parts:
        return "On track today — nice."
    return "You're " + ", and ".join(parts) + "."


def summarize_day(entries: list[dict], targets: dict) -> dict:
    """Sum macros across entries; derive per-macro status + a headline string."""
    totals = {k: 0.0 for k in MACRO_KEYS}
    for e in entries:
        for k in MACRO_KEYS:
            totals[k] += float(e.get(k, 0) or 0)
    status = {k: _status_for(k, totals[k], targets[k]) for k in MACRO_KEYS}
    lows = [_LABELS[k] for k in _HEADLINE_LOW if status[k] == "low"]
    overs = [_LABELS[k] for k in _HEADLINE_OVER if status[k] == "over"]
    return {"totals": totals, "status": status,
            "headline": _headline(lows, overs, bool(entries))}
