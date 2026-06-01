import httpx

_BASE = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"


def _split_ingredients(text: str) -> list[str]:
    if not text:
        return []
    parts = text.replace(";", ",").split(",")
    return [p.strip().lower() for p in parts if p.strip()]


def _main_category(p: dict) -> str:
    """Pick a single, normalized category for the product. OFF returns a comma-list
    in `categories` (broad -> specific); we take the most specific (last) and strip
    any language prefix like 'en:'. Falls back to the first categories_tags entry."""
    raw = (p.get("categories", "") or "").strip()
    if raw:
        last = raw.split(",")[-1].strip()
        if last:
            return last.split(":", 1)[-1].replace("-", " ").strip().lower()
    tags = p.get("categories_tags") or []
    if tags:
        return str(tags[-1]).split(":", 1)[-1].replace("-", " ").strip().lower()
    return ""


def _map_nutrition(n: dict) -> dict:
    g = lambda k: float(n.get(k, 0) or 0)
    return {
        "energy_kj": g("energy-kj_100g"),
        "sugars_g": g("sugars_100g"),
        "sat_fat_g": g("saturated-fat_100g"),
        "salt_g": g("salt_100g"),
        "fibre_g": g("fiber_100g"),
        "protein_g": g("proteins_100g"),
        "fruit_veg_nuts_pct": g("fruits-vegetables-nuts-estimate-from-ingredients_100g"),
    }


def _image_url(p: dict) -> str:
    return (p.get("image_front_url") or p.get("image_url") or "").strip()


class OpenFoodFactsClient:
    """Fetches a product from OpenFoodFacts and normalizes it to our shape."""

    def __init__(self, timeout: float = 6.0):
        self._timeout = timeout

    def fetch(self, barcode: str) -> dict | None:
        try:
            resp = httpx.get(_BASE.format(barcode=barcode), timeout=self._timeout,
                             headers={"User-Agent": "Parakh/0.1"})
        except httpx.HTTPError:
            return None
        if resp.status_code != 200:
            return None
        data = resp.json()
        if data.get("status") != 1 or "product" not in data:
            return None
        p = data["product"]
        nutrition = _map_nutrition(p.get("nutriments", {}))
        return {
            "name": p.get("product_name", "") or "",
            "brand": (p.get("brands", "") or "").split(",")[0].strip(),
            "category": _main_category(p),
            "ingredients": _split_ingredients(p.get("ingredients_text", "")),
            "nutrition": nutrition,
            "image_url": _image_url(p),
        }
