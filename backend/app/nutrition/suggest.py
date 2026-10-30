"""Repeat-meal suggestions: the meals a user usually has in each slot.

A "meal" is everything logged in one slot (breakfast/lunch/snack/dinner) on one day.
Meals with the same set of food names count as the same meal. For each slot the
most frequent meals win, newest first on ties; the newest occurrence is the one
offered for copying.
"""
from collections import defaultdict

SLOTS = ("breakfast", "lunch", "snack", "dinner")


def _key(entries: list[dict]) -> tuple:
    return tuple(sorted(" ".join(e["name"].lower().split()) for e in entries))


def suggest_meals(entries: list[dict], per_slot: int = 2) -> dict[str, list[dict]]:
    """entries: the user's entries from the look-back window (not the viewed day)."""
    meals: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for e in entries:
        if e.get("meal") in SLOTS:
            meals[(e["meal"], e["day"])].append(e)

    groups: dict[str, dict[tuple, dict]] = {s: {} for s in SLOTS}
    for (slot, day), items in meals.items():
        items = sorted(items, key=lambda e: e["id"])
        g = groups[slot].setdefault(_key(items), {"times": 0, "source_day": "", "items": []})
        g["times"] += 1
        if day > g["source_day"]:
            g["source_day"], g["items"] = day, items

    out = {}
    for slot in SLOTS:
        # most frequent first; newest first on ties
        ranked = sorted(groups[slot].values(), key=lambda g: (g["times"], g["source_day"]), reverse=True)
        out[slot] = [{
            "source_day": g["source_day"],
            "times": g["times"],
            "entry_ids": [e["id"] for e in g["items"]],
            "items": [{"name": e["name"], "quantity_g": e["quantity_g"],
                       "kcal": round((e.get("energy_kj") or 0) / 4.184)} for e in g["items"]],
            "kcal": round(sum((e.get("energy_kj") or 0) for e in g["items"]) / 4.184),
            "protein_g": round(sum((e.get("protein_g") or 0) for e in g["items"]), 1),
        } for g in ranked[:per_slot]]
    return out
