from app.scoring.scorer import score as score_fn


class ProductNotFound(Exception):
    """Raised when a barcode is in neither our DB nor OpenFoodFacts (needs a photo)."""


class ScanService:
    """Orchestrates the scan pipeline: our DB -> OpenFoodFacts -> (caller) photo.
    Newly resolved products are scored and written back so future scans are DB hits."""

    def __init__(self, product_repo, off_client, label_extractor):
        self._repo = product_repo
        self._off = off_client
        self._extractor = label_extractor

    def scan_barcode(self, barcode: str) -> dict:
        cached = self._repo.get(barcode)
        if cached is not None:
            return {"source": "db", "product": cached}

        off_data = self._off.fetch(barcode)
        if off_data is not None:
            product = self._score_and_cache(barcode, off_data, source="off")
            return {"source": "off", "product": product}

        raise ProductNotFound(barcode)

    def scan_photo(self, barcode: str, image_bytes: bytes) -> dict:
        data = self._extractor.extract(image_bytes)
        product = self._score_and_cache(barcode, data, source="photo")
        return {"source": "photo", "product": product}

    def _score_and_cache(self, barcode: str, data: dict, source: str) -> dict:
        scored = score_fn(data["ingredients"], data["nutrition"])
        self._repo.save(
            barcode=barcode, name=data["name"], brand=data["brand"],
            ingredients=data["ingredients"], nutrition=data["nutrition"],
            score=scored, source=source,
        )
        return self._repo.get(barcode)
