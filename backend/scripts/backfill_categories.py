"""Re-normalize the category of every cached product into the fixed taxonomy.

Existing rows were saved with raw, narrow categories (or none), so most landed in
categories of one and never showed healthier alternatives. This re-runs
normalize_category() over the stored category (falling back to the product name)
and updates rows in place. Idempotent.

Run inside the backend container:
    docker exec parakh-backend python -m scripts.backfill_categories
"""
from sqlalchemy import select
from app.config import get_settings
from app.db import make_engine, make_session_factory, init_db
from app.models import Product
from app.categories import normalize_category


def main() -> None:
    settings = get_settings()
    engine = make_engine(settings.db_url)
    init_db(engine)
    Session = make_session_factory(engine)

    changed = 0
    with Session() as s:
        products = s.scalars(select(Product)).all()
        for p in products:
            new_cat = normalize_category(p.category or "", p.name or "")
            if new_cat != (p.category or ""):
                print(f"  {p.category!r:>24} -> {new_cat!r:<22} {p.name[:30]}")
                p.category = new_cat
                changed += 1
        s.commit()
    print(f"Backfilled {len(products)} products, {changed} category change(s).")


if __name__ == "__main__":
    main()
