from sqlalchemy import select
from app.models import Product


class ProductRepository:
    """Read/write products in SQLite, keyed by barcode. Returns plain dicts."""

    def __init__(self, session_factory):
        self._Session = session_factory

    def get(self, barcode: str) -> dict | None:
        with self._Session() as s:
            p = s.scalar(select(Product).where(Product.barcode == barcode))
            return self._to_dict(p) if p else None

    def save(self, *, barcode: str, name: str, brand: str,
             ingredients: list, nutrition: dict, score: dict, source: str,
             category: str = "") -> None:
        with self._Session() as s:
            p = s.get(Product, barcode)
            if p is None:
                p = Product(barcode=barcode)
                s.add(p)
            p.name = name
            p.brand = brand
            p.category = category
            p.ingredients = ingredients
            p.nutrition = nutrition
            p.score_overall = score["overall"]
            p.score_grade = score["grade"]
            p.score_json = score
            p.source = source
            s.commit()

    def find_better_in_category(self, *, category: str, min_overall: int,
                                exclude_barcode: str, limit: int = 3) -> list[dict]:
        """Products in the same category scoring strictly higher than min_overall,
        best first. Powers the 'healthier alternatives' feature. An empty category
        never matches (we don't suggest across unknown categories)."""
        if not category:
            return []
        with self._Session() as s:
            rows = s.scalars(
                select(Product)
                .where(Product.category == category)
                .where(Product.score_overall > min_overall)
                .where(Product.barcode != exclude_barcode)
                .order_by(Product.score_overall.desc())
                .limit(limit)
            ).all()
            return [self._to_dict(p) for p in rows]

    @staticmethod
    def _to_dict(p: Product) -> dict:
        return {
            "barcode": p.barcode, "name": p.name, "brand": p.brand,
            "category": p.category,
            "ingredients": p.ingredients, "nutrition": p.nutrition,
            "score": p.score_json,
            "source": p.source,
        }
