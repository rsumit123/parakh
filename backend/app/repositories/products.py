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
             ingredients: list, nutrition: dict, score: dict, source: str) -> None:
        with self._Session() as s:
            p = s.get(Product, barcode)
            if p is None:
                p = Product(barcode=barcode)
                s.add(p)
            p.name = name
            p.brand = brand
            p.ingredients = ingredients
            p.nutrition = nutrition
            p.score_overall = score["overall"]
            p.score_grade = score["grade"]
            p.score_breakdown = score.get("breakdown", {})
            p.source = source
            s.commit()

    @staticmethod
    def _to_dict(p: Product) -> dict:
        return {
            "barcode": p.barcode, "name": p.name, "brand": p.brand,
            "ingredients": p.ingredients, "nutrition": p.nutrition,
            "score": {"overall": p.score_overall, "grade": p.score_grade,
                      "breakdown": p.score_breakdown},
            "source": p.source,
        }
