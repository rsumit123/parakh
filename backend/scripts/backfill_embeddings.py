"""Embed every product that doesn't yet have an embedding (batched), so semantic
"Healthier options" matching works. Cheap + idempotent — run after each catalog seed:
    docker exec parakh-backend python -m scripts.backfill_embeddings
Requires PARAKH_OPENAI_API_KEY in the environment.
"""
from sqlalchemy import select
from app.config import get_settings
from app.db import make_engine, make_session_factory, init_db
from app.models import Product
from app.embeddings import embed_texts, product_text

BATCH = 200


def main() -> None:
    settings = get_settings()
    if not settings.openai_api_key:
        print("PARAKH_OPENAI_API_KEY not set — nothing embedded.")
        return
    engine = make_engine(settings.db_url)
    init_db(engine)
    sf = make_session_factory(engine)
    with sf() as s:
        rows = s.scalars(select(Product)).all()
        todo = [p for p in rows if not p.embedding]
        print(f"{len(todo)} of {len(rows)} products need embeddings...")
        for i in range(0, len(todo), BATCH):
            chunk = todo[i:i + BATCH]
            vecs = embed_texts([product_text(p.name, p.category) for p in chunk])
            for p, v in zip(chunk, vecs):
                p.embedding = v
            s.commit()
            print(f"  embedded {min(i + BATCH, len(todo))}/{len(todo)}")
    print("Done.")


if __name__ == "__main__":
    main()
