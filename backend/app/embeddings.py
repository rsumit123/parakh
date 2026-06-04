"""Product embeddings (OpenAI) for semantic 'Healthier options' matching, so swaps
stay like-for-like across every category (buttermilk -> chaas, dark choc 70% -> 90%)
without hand-written keyword lists."""
import httpx
from app.config import get_settings


class EmbeddingError(Exception):
    """Raised when the embedding API returns a non-200."""


def product_text(name: str, category: str) -> str:
    """The short text we embed for a product."""
    return f"{(name or '').strip()}. {(category or '').strip()}".strip()


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts. Returns one vector per text. If the key is unset or the
    call fails, returns empty vectors so callers degrade gracefully (no embeddings ->
    alternatives fall back to score order)."""
    s = get_settings()
    if not s.openai_api_key or not texts:
        return [[] for _ in texts]
    try:
        resp = httpx.post(
            s.embedding_url,
            headers={"Authorization": f"Bearer {s.openai_api_key}"},
            json={"model": s.embedding_model, "input": texts, "dimensions": s.embedding_dims},
            timeout=30.0,
        )
    except httpx.HTTPError as e:
        raise EmbeddingError(str(e)) from e
    if resp.status_code != 200:
        raise EmbeddingError(f"openai embeddings status {resp.status_code}")
    return [d["embedding"] for d in resp.json()["data"]]


def embed_one(name: str, category: str) -> list[float]:
    """Embed a single product; '' (empty vector) on any failure."""
    try:
        return embed_texts([product_text(name, category)])[0]
    except Exception:
        return []
