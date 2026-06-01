from app.scoring.scorer import score as score_fn
from app.categories import normalize_category
from app.repositories.products import _norm_key

# Nutrition keys that indicate the product actually carries usable label data.
_NUTRITION_SIGNALS = ("energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g")


def _has_usable_nutrition(nutrition: dict) -> bool:
    """True if at least one core nutrition value is present and non-zero.
    Products with all-zero nutrition (e.g. an OpenFoodFacts entry that has a name but
    no nutrition facts) produce a meaningless score, so we don't present/keep them."""
    return any(float(nutrition.get(k, 0) or 0) > 0 for k in _NUTRITION_SIGNALS)


class ProductNotFound(Exception):
    """Raised when a barcode is in neither our DB nor OpenFoodFacts with usable data
    (the caller should then ask the user to photograph the label)."""


class ScanService:
    """Orchestrates the scan pipeline: our DB -> OpenFoodFacts -> (caller) photo.
    Newly resolved products are scored and written back so future scans are DB hits.
    A cached or OpenFoodFacts record with no usable nutrition is treated as a miss so
    the user is asked for a label photo (this also self-heals old empty cache rows)."""

    def __init__(self, product_repo, off_client, label_extractor):
        self._repo = product_repo
        self._off = off_client
        self._extractor = label_extractor

    def scan_barcode(self, barcode: str) -> dict:
        cached = self._repo.get(barcode)
        if cached is not None and _has_usable_nutrition(cached.get("nutrition", {})):
            return self._envelope("db", cached)

        off_data = self._off.fetch(barcode)
        if off_data is not None and _has_usable_nutrition(off_data["nutrition"]):
            product = self._score_and_cache(barcode, off_data, source="off")
            return self._envelope("off", product)

        raise ProductNotFound(barcode)

    def scan_photo(self, barcode: str, image_bytes: bytes) -> dict:
        data = self._extractor.extract(image_bytes)
        product = self._score_and_cache(barcode, data, source="photo")
        return self._envelope("photo", product)

    def _envelope(self, source: str, product: dict) -> dict:
        """Wrap a product with its source and a few healthier same-category alternatives."""
        alternatives = self._repo.find_better_in_category(
            category=product.get("category", ""),
            min_overall=product["score"]["overall"],
            exclude_barcode=product["barcode"],
            better_than_grade=product["score"].get("grade", ""),
            exclude_name_brand=_norm_key(product.get("name", ""), product.get("brand", "")),
        )
        return {"source": source, "product": product, "alternatives": alternatives}

    def _score_and_cache(self, barcode: str, data: dict, source: str) -> dict:
        # Normalize the free-text category into a fixed bucket so this product can
        # be compared against peers (otherwise it lands in a category of one and
        # never gets "healthier alternatives").
        category = normalize_category(data.get("category", ""), data.get("name", ""))
        scored = score_fn(data["ingredients"], data["nutrition"], category)
        self._repo.save(
            barcode=barcode, name=data["name"], brand=data["brand"],
            category=category,
            ingredients=data["ingredients"], nutrition=data["nutrition"],
            score=scored, source=source, image_url=data.get("image_url", ""),
        )
        return self._repo.get(barcode)
