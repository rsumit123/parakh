"""Normalize free-text product categories into a small, fixed taxonomy.

The vision model (and OpenFoodFacts) emit narrow, inconsistent category strings
("flavoured milk", "rose flavoured milk", "potato chips", "chaat masala"...), so
products that should compare against each other end up in categories of one and
never get "healthier alternatives". This maps those strings onto sensible
mid-level buckets — broad enough that related products cluster, narrow enough that
the comparison still makes sense (we don't suggest a biscuit as an alt for a soda).

Matching uses a LEADING WORD BOUNDARY (keyword must start at the beginning of a
word), so e.g. "cola" does NOT match inside "chocolate" but does match "coca-cola".

normalize_category() is deterministic and idempotent (a bucket maps to itself).
"""
import re

# (bucket, keywords). ORDER MATTERS: the first bucket with a hit wins, so more
# specific groups precede broader ones that could share a word (spreads before
# chocolate so "chocolate hazelnut spread" -> spreads; drinks before dairy so a
# milk-based *drink* stays a drink).
_BUCKETS: list[tuple[str, tuple[str, ...]]] = [
    ("spreads & sauces", (
        "peanut butter", "spread", "jam", "ketchup", "sauce", "honey",
        "mayonnaise", "mayo",
    )),
    # Malt / nutrition POWDERS — before drinks (so "nutrition drink" lands here, not
    # drinks) and before dairy (so "milk" doesn't grab them). Scored as food.
    ("health drinks", (
        "bournvita", "horlicks", "boost", "complan", "pediasure", "malt",
        "health drink", "nutrition drink", "drinking chocolate",
    )),
    ("ice cream", ("ice cream", "icecream", "kulfi", "gelato", "frozen dessert")),
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
    # Chips/crisps — before namkeen so they split out of the savoury-snack bucket.
    ("chips", ("potato chip", "chips", "crisps", "nachos", "wafer")),
    ("namkeen", (
        "namkeen", "bhujia", "bhuja", "sev", "mixture", "farsan", "chivda",
        "savoury", "savory", "makhana", "snack",
    )),
    ("bread", ("bread", "pav", "loaf", "baguette", "croissant", "bun")),
    ("biscuits", ("biscuit", "cookie", "cracker", "rusk")),
    ("chocolate", ("chocolate", "cocoa", "cacao")),
    ("condiments & spices", (
        "masala", "spice", "asafoetida", "hing", "pickle", "achaar", "chutney",
        "seasoning",
    )),
    ("sweets", ("mithai", "halwa", "candy", "toffee", "gulab jamun", "sweet")),
    ("dairy", ("milk", "curd", "dahi", "yogurt", "yoghurt", "paneer", "cheese",
               "ghee", "butter", "dairy")),
]

# Precompile one leading-boundary pattern per keyword. `(?<![a-z])` = not preceded
# by a letter, so the keyword must begin a word ("cola" matches "coca-cola" and
# " cola" but not "chocolate"). No trailing boundary, so "potato chip" still
# matches "potato chips".
_COMPILED: list[tuple[str, tuple[re.Pattern, ...]]] = [
    (bucket, tuple(re.compile(r"(?<![a-z])" + re.escape(kw)) for kw in kws))
    for bucket, kws in _BUCKETS
]


def _match(text: str) -> str | None:
    for bucket, patterns in _COMPILED:
        if any(p.search(text) for p in patterns):
            return bucket
    return None


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
    nm = (name or "").strip().lower()
    if nm:
        bucket = _match(nm)
        if bucket:
            return bucket
    return cat  # unknown but consistent (identical raws still cluster together)
