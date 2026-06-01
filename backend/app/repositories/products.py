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
             category: str = "", image_url: str = "") -> None:
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
            p.image_url = image_url
            s.commit()

    def find_better_in_category(self, *, category: str, min_overall: int,
                                exclude_barcode: str, limit: int = 3,
                                better_than_grade: str = "") -> list[dict]:
        """Healthier alternatives in the same category, best first.

        A suggestion must be MEANINGFULLY better — a better grade letter, not just a
        couple more points (otherwise we'd tell someone to swap their B drink for a
        slightly different B). When `better_than_grade` is given we require the
        candidate's grade to be strictly better; we always also require a higher
        score as a tie-break floor. An empty category never matches."""
        if not category:
            return []
        # Score floors per grade band (mirror grade_from_score): to beat grade X we
        # need at least the next band up's minimum overall.
        _GRADE_FLOOR = {"E": 20, "D": 40, "C": 60, "B": 80, "A": 101}
        floor = max(min_overall + 1, _GRADE_FLOOR.get(better_than_grade.upper(), min_overall + 1))
        with self._Session() as s:
            rows = s.scalars(
                select(Product)
                .where(Product.category == category)
                .where(Product.score_overall >= floor)
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
            "image_url": p.image_url,
        }
