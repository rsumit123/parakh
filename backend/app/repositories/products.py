import re
from sqlalchemy import select, func
from app.models import Product


def _norm_key(name: str, brand: str) -> str:
    """Normalized identity for dedup: each of name/brand lowercased, trimmed, and
    whitespace-collapsed, joined as 'name|brand'."""
    norm = lambda s: re.sub(r"\s+", " ", (s or "")).strip().lower()
    return f"{norm(name)}|{norm(brand)}"


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
                                better_than_grade: str = "",
                                exclude_name_brand: str = "") -> list[dict]:
        """Healthier alternatives in the same category, best first.

        A suggestion must be MEANINGFULLY better — a better grade letter, not just a
        couple more points. When `better_than_grade` is given we require the candidate's
        grade to be strictly better; we always also require a higher score as a tie-break
        floor. `exclude_name_brand` (a `_norm_key`) drops a duplicate of the scanned
        product stored under a different barcode, so a product is never its own option.
        An empty category never matches."""
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
            ).all()
        out: list[dict] = []
        for p in rows:
            if exclude_name_brand and _norm_key(p.name, p.brand) == exclude_name_brand:
                continue
            out.append(self._to_dict(p))
            if len(out) >= limit:
                break
        return out

    def category_counts(self) -> list[dict]:
        """Non-empty categories with their product counts, most products first."""
        with self._Session() as s:
            distinct_products = func.count(func.distinct(
                func.lower(Product.name).op("||")("|").op("||")(func.lower(Product.brand))))
            rows = s.execute(
                select(Product.category, distinct_products)
                .where(Product.category != "")
                .where(Product.name != "")
                .group_by(Product.category)
                .order_by(distinct_products.desc(), Product.category.asc())
            ).all()
            return [{"category": c, "count": n} for c, n in rows]

    def list_products(self, *, category: str = "", grade: str = "", q: str = "",
                      limit: int = 60, offset: int = 0) -> dict:
        """Filtered product list, healthiest first. Filters (category/grade/q) are
        ANDed; any blank filter is ignored. `q` matches name OR brand, case-insensitive.
        Unnamed rows are excluded, and rows are de-duplicated by normalized name+brand
        (keeping the copy that has an image, then the highest score) so a product shows
        once. Returns {items: [...], total: <distinct count before paging>}."""
        limit = max(1, min(limit, 200))
        offset = max(0, offset)
        conds = [Product.name != ""]  # never surface "Unknown product" rows in browse
        if category:
            conds.append(Product.category == category)
        if grade:
            conds.append(Product.score_grade == grade)
        if q:
            like = f"%{q.strip().lower()}%"
            conds.append(func.lower(Product.name).like(like) | func.lower(Product.brand).like(like))
        with self._Session() as s:
            list_q = select(Product)
            for c in conds:
                list_q = list_q.where(c)
            # Order so the preferred representative of each name+brand comes first:
            # an imaged row, then higher score.
            rows = s.scalars(
                list_q.order_by((Product.image_url != "").desc(),
                                Product.score_overall.desc(), Product.name.asc())
            ).all()
            seen: set[str] = set()
            deduped = []
            for p in rows:
                k = _norm_key(p.name, p.brand)
                if k in seen:
                    continue
                seen.add(k)
                deduped.append(p)
            deduped.sort(key=lambda p: (-p.score_overall, p.name))  # healthiest first
            total = len(deduped)
            page = deduped[offset:offset + limit]
            return {"items": [self._to_dict(p) for p in page], "total": total}

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
