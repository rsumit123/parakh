import re
from sqlalchemy import select, func
from app.models import Product
from app.embeddings import cosine


def _norm_key(name: str, brand: str) -> str:
    """Normalized identity for dedup: each of name/brand lowercased, trimmed, and
    whitespace-collapsed, joined as 'name|brand'."""
    norm = lambda s: re.sub(r"\s+", " ", (s or "")).strip().lower()
    return f"{norm(name)}|{norm(brand)}"


def _norm_text(s: str) -> str:
    """Lowercase + drop everything but letters/digits, so search ignores spaces and
    punctuation: 'Lay's' -> 'lays', matching a query of 'lays'."""
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


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
             category: str = "", image_url: str = "", embedding: list | None = None,
             serving_size_g: float | None = None) -> None:
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
            if serving_size_g is not None:
                p.serving_size_g = serving_size_g
            if embedding is not None:  # preserve an existing embedding when not provided
                p.embedding = embedding
            s.commit()

    def get_embedding(self, barcode: str) -> list:
        with self._Session() as s:
            p = s.scalar(select(Product.embedding).where(Product.barcode == barcode))
            return p or []

    def find_better_in_category(self, *, category: str, min_overall: int,
                                exclude_barcode: str, limit: int = 3,
                                better_than_grade: str = "",
                                exclude_name_brand: str = "",
                                query_embedding: list | None = None,
                                min_similarity: float = 0.5) -> list[dict]:
        """Healthier alternatives in the same category, best first.

        A suggestion must be MEANINGFULLY better — a strictly better grade letter (plus a
        higher score as a tie-break floor). `exclude_name_brand` (a `_norm_key`) drops a
        duplicate of the scanned product stored under a different barcode. When
        `query_embedding` is given, candidates are ranked by cosine similarity to the
        scanned product and any below `min_similarity` are dropped — so suggestions stay
        like-for-like (a lassi suggests buttermilk, never a juice) across EVERY category;
        better to show nothing than something unrelated. Without an embedding we fall back
        to score order. An empty category never matches."""
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
        cands = [p for p in rows
                 if not (exclude_name_brand and _norm_key(p.name, p.brand) == exclude_name_brand)]
        if query_embedding:
            # Keep only similar-enough products, ordered most-similar first.
            scored = [(cosine(query_embedding, p.embedding), p) for p in cands if p.embedding]
            scored = [(sim, p) for sim, p in scored if sim >= min_similarity]
            scored.sort(key=lambda x: -x[0])
            cands = [p for _, p in scored]
        out: list[dict] = []
        seen: set[str] = set()
        for p in cands:  # de-dup the suggestions by NAME (same product can have
            k = _norm_text(p.name)  # inconsistent brand strings, e.g. "Coke Zero" vs "Coca-Cola")
            if not k or k in seen:
                continue
            seen.add(k)
            out.append(self._to_dict(p))
            if len(out) >= limit:
                break
        return out

    def category_counts(self) -> list[dict]:
        """Non-empty categories with their product counts, most products first.
        Excludes one-off user photo scans (source='photo')."""
        with self._Session() as s:
            distinct_products = func.count(func.distinct(
                func.lower(Product.name).op("||")("|").op("||")(func.lower(Product.brand))))
            rows = s.execute(
                select(Product.category, distinct_products)
                .where(Product.category != "")
                .where(Product.name != "")
                .where(Product.source != "photo")
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
        conds = [Product.name != "", Product.source != "photo"]  # never surface unnamed or one-off user-scan rows
        if category:
            conds.append(Product.category == category)
        if grade:
            conds.append(Product.score_grade == grade)
        # `q` is matched in Python, punctuation-insensitively, so "lays" finds "Lay's".
        nq = _norm_text(q)
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
            if nq:
                rows = [p for p in rows
                        if nq in _norm_text(p.name) or nq in _norm_text(p.brand)]
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

    def dedupe_by_name_brand(self, dry_run: bool = False) -> int:
        """Collapse rows that share a normalized name+brand down to one best row,
        keeping (in priority): a real barcode over an 'amazon:<asin>' synthetic key
        (so physical scans still hit), then one that has an image, then the higher
        score. Deletes the rest. Returns how many rows were (or would be) removed.
        Empty-name rows are ignored. Safe to re-run; run after each catalog seed."""
        with self._Session() as s:
            rows = s.scalars(select(Product).where(Product.name != "")).all()
            groups: dict[str, list[Product]] = {}
            for p in rows:
                groups.setdefault(_norm_key(p.name, p.brand), []).append(p)
            removed = 0
            for ps in groups.values():
                if len(ps) < 2:
                    continue
                ps.sort(key=lambda p: (
                    1 if p.barcode.startswith("amazon:") else 0,  # real barcode first
                    0 if p.image_url else 1,                       # imaged first
                    -p.score_overall,                              # higher score first
                    p.barcode,                                     # stable tiebreak
                ))
                for dup in ps[1:]:
                    removed += 1
                    if not dry_run:
                        s.delete(dup)
            if not dry_run:
                s.commit()
            return removed

    @staticmethod
    def _to_dict(p: Product) -> dict:
        return {
            "barcode": p.barcode, "name": p.name, "brand": p.brand,
            "category": p.category,
            "ingredients": p.ingredients, "nutrition": p.nutrition,
            "score": p.score_json,
            "source": p.source,
            "image_url": p.image_url,
            "serving_size_g": p.serving_size_g,
        }
