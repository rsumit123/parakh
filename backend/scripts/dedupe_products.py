"""Collapse duplicate product rows (same normalized name+brand) to one best row.

Keeps a real barcode over an 'amazon:<asin>' key, then an imaged row, then the
higher score. Run after each catalog seed so overlapping category pulls don't pile
up duplicates. Dry-run first to see the count:
    docker exec parakh-backend python -m scripts.dedupe_products --dry-run
    docker exec parakh-backend python -m scripts.dedupe_products
"""
import sys
from app.config import get_settings
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository


def main() -> None:
    dry = "--dry-run" in sys.argv
    settings = get_settings()
    engine = make_engine(settings.db_url)
    init_db(engine)
    repo = ProductRepository(make_session_factory(engine))
    n = repo.dedupe_by_name_brand(dry_run=dry)
    print(f"{'Would remove' if dry else 'Removed'} {n} duplicate rows.")


if __name__ == "__main__":
    main()
