import httpx
import respx
from app.embeddings import cosine, product_text, embed_texts, embed_one


def test_product_text():
    assert product_text("Amul Buttermilk", "drinks") == "Amul Buttermilk. drinks"


def test_cosine():
    assert cosine([1, 0], [1, 0]) == 1.0
    assert abs(cosine([1, 0], [0, 1])) < 1e-9
    assert cosine([], [1, 2]) == 0.0


@respx.mock
def test_embed_texts_calls_api(monkeypatch):
    monkeypatch.setenv("PARAKH_OPENAI_API_KEY", "sk-test")
    respx.post("https://api.openai.com/v1/embeddings").mock(
        return_value=httpx.Response(200, json={"data": [{"embedding": [0.1, 0.2]}, {"embedding": [0.3, 0.4]}]}))
    out = embed_texts(["a", "b"])
    assert out == [[0.1, 0.2], [0.3, 0.4]]


def test_embed_returns_empty_when_key_unset(monkeypatch):
    monkeypatch.setenv("PARAKH_OPENAI_API_KEY", "")
    assert embed_texts(["a"]) == [[]]
    assert embed_one("X", "drinks") == []
