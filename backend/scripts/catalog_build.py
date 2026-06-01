"""Pure helpers for the one-time Amazon catalog build (Task 9). No I/O, no network —
the orchestration in Task 9 supplies decoded barcodes and subagent extractions and
calls these to assemble committed records. Safe to unit-test in isolation."""
import re

CATEGORY_MAP = {
    "breakfast": "breakfast cereal",
    "dark_chocolate": "chocolate",
    "drinks": "drinks",
    "namkeen_snacks": "namkeen",
}

_CORE = ("energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g")
_EAN_FORMATS = {"EAN13", "EAN8", "UPCA", "UPCE"}


def category_for_filename(filename: str) -> str:
    key = filename
    for suffix in ("_products_sumits_private.json", "_products.json", ".json"):
        if key.endswith(suffix):
            key = key[: -len(suffix)]
            break
    return CATEGORY_MAP.get(key, "")


def clean_brand(raw) -> str:
    if not raw:
        return ""
    b = str(raw).strip()
    if b.lower().startswith("visit the "):
        b = b[len("visit the "):]
    if b.lower().endswith(" store"):
        b = b[: -len(" store")]
    return b.strip()


def derive_name(agent_name, title: str) -> str:
    if agent_name and str(agent_name).strip():
        return str(agent_name).strip()
    seg = re.split(r"[|,]", title or "", maxsplit=1)[0].strip()
    seg = re.sub(r"\s+\d[\d.]*\s*(g|kg|ml|l)\b.*$", "", seg, flags=re.I).strip()
    return seg


def filter_own_images(image_urls, asin: str) -> list:
    out = []
    for u in image_urls or []:
        m = re.search(r"\.amazonaws\.com/[^/]+/([^/]+)/", u)
        if m and m.group(1) == asin:
            out.append(u)
    return out


def validate_nutrition(nutrition: dict, found: bool, confidence: str):
    if not found:
        return (False, "no_nutrition")
    if confidence == "low":
        return (False, "low_confidence")
    g = lambda k: float((nutrition or {}).get(k, 0) or 0)
    for k in _CORE + ("fruit_veg_nuts_pct",):
        if g(k) < 0:
            return (False, f"implausible:{k}")
    if g("energy_kj") > 3800:
        return (False, "implausible:energy_kj")
    for k in ("sugars_g", "sat_fat_g", "protein_g", "fibre_g", "salt_g"):
        if g(k) > 100:
            return (False, f"implausible:{k}")
    if not any(g(k) > 0 for k in _CORE):
        return (False, "no_nutrition")
    return (True, "")


def pick_barcode(decoded, asin: str):
    """decoded: list of (image_url, text, format). Return (barcode, barcode_image_url)."""
    for url, text, fmt in decoded:
        if fmt in _EAN_FORMATS and str(text).isdigit():
            return (str(text), url)
    return (f"amazon:{asin}", "")


def _img_at(own_images, idx):
    if isinstance(idx, int) and 0 <= idx < len(own_images):
        return own_images[idx]
    return ""


def assemble_record(*, asin, title, raw_brand, category, own_images, agent,
                    barcode, barcode_image_url) -> dict:
    return {
        "barcode": barcode,
        "asin": asin,
        "name": derive_name(agent.get("name"), title),
        "brand": clean_brand(raw_brand),
        "category": category,
        "ingredients": agent.get("ingredients", []),
        "nutrition": agent.get("nutrition", {}),
        "display_image_url": _img_at(own_images, agent.get("display_image_index")) or (own_images[0] if own_images else ""),
        "nutrition_image_url": _img_at(own_images, agent.get("nutrition_image_index")),
        "ingredients_image_url": _img_at(own_images, agent.get("ingredients_image_index")),
        "barcode_image_url": barcode_image_url,
        "confidence": agent.get("confidence", ""),
    }
