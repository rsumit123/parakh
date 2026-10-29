"""Pure daily-target math for diet tracking. No DB, no clock — callers pass data in.

Two nutrient roles:
- HIT  (protein, fibre): being UNDER the target is the problem -> status "low".
- LIMIT (energy, sugar, sat-fat, salt): being OVER is the problem -> status "over".
"""
import math

CORE_KEYS = ("energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g")
# Added later and may be unknown (None) on older entries/products, so they're summed
# over known values and flagged "partial". Informational only: no low/over status.
OPTIONAL_KEYS = ("carbs_g", "fat_g")
MACRO_KEYS = CORE_KEYS + OPTIONAL_KEYS
HIT = ("protein_g", "fibre_g")
LIMIT = ("energy_kj", "sugars_g", "sat_fat_g", "salt_g")

# Conservative adult guideline defaults (unisex). energy ~2000 kcal in kJ.
_DEFAULTS = {
    "energy_kj": 8368.0, "protein_g": 50.0, "fibre_g": 30.0,
    "sugars_g": 50.0, "sat_fat_g": 22.0, "salt_g": 5.0,
    "carbs_g": 250.0, "fat_g": 67.0,   # 50% / 30% of 2000 kcal
}
# Nutrients named in the headline (energy intentionally excluded — no calorie-shaming).
_HEADLINE_LOW = ("fibre_g", "protein_g")
_HEADLINE_OVER = ("sugars_g", "sat_fat_g", "salt_g")
_LABELS = {"energy_kj": "energy", "protein_g": "protein", "fibre_g": "fibre",
           "sugars_g": "sugar", "sat_fat_g": "sat fat", "salt_g": "salt",
           "carbs_g": "carbs", "fat_g": "fat"}


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


# Assumed values for About-you fields the user hasn't filled in, so every choice they
# do make (e.g. "Very active") still moves the targets. Heights/weights are typical
# Indian adults; with no sex given, the Mifflin-St Jeor sex term is averaged.
_ASSUME = {"age": 30, "activity": "light", "goal": "maintain"}
_ASSUME_BODY = {"male": (172.0, 70.0), "female": (158.0, 57.0), None: (165.0, 63.0)}
_FIELDS = ("sex", "age", "weight_kg", "height_cm", "activity", "goal")


def targets_basis(profile: dict | None) -> str:
    """'calculated' (full profile), 'estimated' (partial: gaps assumed) or 'default'."""
    if is_personalised(profile):
        return "calculated"
    p = profile or {}
    return "estimated" if any(p.get(f) for f in _FIELDS) else "default"


def _fill(profile: dict) -> dict:
    p = dict(profile)
    sex = p.get("sex") if p.get("sex") in ("male", "female") else None
    h, w = _ASSUME_BODY[sex]
    p["height_cm"] = p.get("height_cm") or h
    p["weight_kg"] = p.get("weight_kg") or w
    for k, v in _ASSUME.items():
        if not p.get(k) or (k == "activity" and p[k] not in _ACTIVITY) or (k == "goal" and p[k] not in _GOAL_KCAL):
            p[k] = v
    p["sex"] = sex
    return p


def personal_targets(profile: dict | None) -> dict | None:
    """Targets from body + lifestyle, or None if the profile is incomplete.

    Energy: Mifflin-St Jeor BMR x activity factor, +/- for the goal (floored).
    Protein: g per kg body weight. Fibre: 15 g per 1000 kcal. Sugar and sat fat:
    each under 10% of energy (WHO). Salt: 5 g (WHO), independent of size.
    Carbs ~50% and fat ~30% of energy, shown for reference only."""
    if not is_personalised(profile):
        return None
    return _calc(profile or {})


def _r(x: float) -> float:
    """Round half up, like JavaScript's Math.round, so the app's live preview matches."""
    return float(math.floor(x + 0.5))


def _calc(p: dict) -> dict:
    w, h, age = float(p["weight_kg"]), float(p["height_cm"]), float(p["age"])
    sex_term = {"male": 5, "female": -161}.get(p.get("sex"), -78)  # -78: average of the two
    bmr = 10 * w + 6.25 * h - 5 * age + sex_term
    kcal_day = _r(max(_MIN_KCAL, bmr * _ACTIVITY[p["activity"]] + _GOAL_KCAL[p["goal"]]))
    return {
        "energy_kj": kcal_day * _KJ_PER_KCAL,
        "protein_g": _r((w * _PROTEIN_G_PER_KG[p["goal"]])),
        "fibre_g": _r((kcal_day * 15 / 1000)),
        "sugars_g": _r((kcal_day * 0.10 / 4)),
        "sat_fat_g": _r((kcal_day * 0.10 / 9)),
        "salt_g": 5.0,
        "carbs_g": _r((kcal_day * 0.50 / 4)),   # ~50% of energy (ICMR range 45-65%)
        "fat_g": _r((kcal_day * 0.30 / 9)),     # ~30% of energy (WHO upper bound)
    }


def compute_targets(profile: dict | None = None, with_overrides: bool = True) -> dict:
    """Daily targets: calculated from a complete profile, estimated from a partial one
    (missing fields assumed), else smart defaults; explicit per-macro overrides win
    (unless with_overrides=False)."""
    basis = targets_basis(profile)
    if basis == "calculated":
        targets = _calc(profile or {})
    elif basis == "estimated":
        targets = _calc(_fill(profile or {}))
    else:
        targets = dict(_DEFAULTS)
    if not with_overrides:
        return targets
    overrides = ((profile or {}).get("target_overrides")) or {}
    for k in MACRO_KEYS:
        v = overrides.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0:
            targets[k] = float(v)
    return targets


def _status_for(macro: str, consumed: float, target: float) -> str:
    if macro in OPTIONAL_KEYS:
        return "ok"
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
    partial: list[str] = []
    for e in entries:
        for k in MACRO_KEYS:
            v = e.get(k)
            if v is None:
                if k in OPTIONAL_KEYS and k not in partial:
                    partial.append(k)
                continue
            totals[k] += float(v)
    status = {k: _status_for(k, totals[k], targets[k]) for k in MACRO_KEYS}
    lows = [_LABELS[k] for k in _HEADLINE_LOW if status[k] == "low"]
    overs = [_LABELS[k] for k in _HEADLINE_OVER if status[k] == "over"]
    return {"partial": [k for k in OPTIONAL_KEYS if k in partial], "totals": totals, "status": status,
            "headline": _headline(lows, overs, bool(entries))}
