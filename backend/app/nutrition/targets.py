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


def compute_targets(profile: dict | None = None) -> dict:
    """Return the 6 daily targets. Smart defaults; explicit per-macro overrides win."""
    targets = dict(_DEFAULTS)
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
    if len(names) <= 1:
        return names[0] if names else ""
    return " & ".join([", ".join(names[:-1]), names[-1]]) if len(names) > 2 else f"{names[0]} & {names[1]}"


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
