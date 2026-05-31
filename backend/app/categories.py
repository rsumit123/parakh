"""Normalize free-text product categories into a small, fixed taxonomy.

The vision model (and OpenFoodFacts) emit narrow, inconsistent category strings
("flavoured milk", "rose flavoured milk", "potato chips", "chaat masala"...), so
products that should compare against each other end up in categories of one and
never get "healthier alternatives". This maps those strings onto sensible
mid-level buckets — broad enough that related products cluster, narrow enough that
the comparison still makes sense (we don't suggest a biscuit as an alt for a soda).

normalize_category() is deterministic and idempotent (a bucket maps to itself).
"""

# (bucket, keywords). ORDER MATTERS: the first bucket with a substring hit wins,
# so more specific groups are listed before broader ones that share a word
# (e.g. drinks before dairy so "flavoured milk"/"buttermilk" -> drinks, not dairy;
#  spreads before chocolate so "chocolate hazelnut spread" -> spreads).
_BUCKETS: list[tuple[str, tuple[str, ...]]] = [
    ("drinks", (
        "buttermilk", "chaas", "lassi", "flavoured milk", "flavored milk",
        "milkshake", "milk shake", "soft drink", "cola", "soda", "juice",
        "nectar", "squash", "sharbat", "smoothie", "iced tea", "energy drink",
        "beverage", "drink",
    )),
    ("breakfast cereal", (
        "corn flake", "cornflake", "muesli", "granola", "oats", "porridge",
        "breakfast cereal", "cereal",
    )),
    ("noodles & pasta", ("noodle", "pasta", "vermicelli", "macaroni")),
    ("namkeen", (
        "namkeen", "bhujia", "bhuja", "sev", "mixture", "farsan", "chivda",
        "wafer", "potato chip", "chips", "savoury", "savory", "makhana",
        "snack",
    )),
    ("biscuits", ("biscuit", "cookie", "cracker", "rusk")),
    ("spreads & sauces", (
        "peanut butter", "spread", "jam", "ketchup", "sauce", "honey",
        "mayonnaise", "mayo",
    )),
    ("chocolate", ("chocolate", "cocoa", "cacao")),
    ("condiments & spices", (
        "masala", "spice", "asafoetida", "hing", "pickle", "achaar", "chutney",
        "seasoning",
    )),
    ("sweets", ("mithai", "halwa", "candy", "toffee", "gulab jamun", "sweet")),
    ("dairy", ("milk", "curd", "dahi", "yogurt", "yoghurt", "paneer", "cheese",
               "ghee", "butter", "dairy")),
]


def normalize_category(raw: str, name: str = "") -> str:
    """Map a free-text category onto a fixed bucket.

    Matches keywords against the raw category first; if that yields nothing and a
    product name is given, tries the name as a fallback. Returns the bucket name,
    or the cleaned raw category if no bucket matches, or "" if there's nothing.
    """
    cat = (raw or "").strip().lower()
    if cat:
        bucket = _match(cat)
        if bucket:
            return bucket
    # Fallback: try to infer from the product name (best-effort).
    nm = (name or "").strip().lower()
    if nm:
        bucket = _match(nm)
        if bucket:
            return bucket
    return cat  # unknown but consistent (identical raws still cluster together)


def _match(text: str) -> str | None:
    for bucket, keywords in _BUCKETS:
        if any(kw in text for kw in keywords):
            return bucket
    return None
