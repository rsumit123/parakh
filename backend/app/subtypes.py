"""Finer 'sub-types' within a broad category, used to keep "Healthier options"
like-for-like — a lassi should suggest buttermilk/chaas, not a random sea-buckthorn
juice. Only `drinks` is sub-typed for now (the bucket most prone to irrelevant
cross-suggestions). Returns '' when no sub-type applies (callers then fall back to
the whole category)."""

_DRINK_SUBTYPES: list[tuple[str, tuple[str, ...]]] = [
    # dairy first, so "mango lassi" / "cold coffee" classify as dairy despite other words
    ("dairy", ("buttermilk", "chaas", "chhach", "chhaas", "lassi", "yogurt", "yoghurt",
               "dahi", "milkshake", "milk shake", "flavoured milk", "flavored milk",
               "badam milk", "masala milk", "shrikhand", "kefir", "cold coffee")),
    ("soda", ("cola", "soda", "carbonated", "soft drink", "fizzy", "tonic water", "sparkling")),
    ("juice", ("juice", "nectar", "squash", "aamras", "sharbat", "pulp", "concentrate",
               "mocktail", "crush")),
    ("energy", ("energy drink", "sports drink", "electrolyte", "glucose")),
    ("tea_coffee", ("iced tea", "green tea", "kombucha", "tea", "coffee")),
    ("water", ("coconut water", "spring water", "mineral water", "enhanced water")),
]


def subtype_of(category: str, name: str, ingredients: list[str]) -> str:
    if category != "drinks":
        return ""
    text = (name or "").lower() + " " + " ".join(i.lower() for i in (ingredients or []))
    for st, kws in _DRINK_SUBTYPES:
        if any(k in text for k in kws):
            return st
    return ""
