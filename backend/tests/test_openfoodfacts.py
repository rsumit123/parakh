import httpx
import respx
from app.clients.openfoodfacts import OpenFoodFactsClient, _serving_grams

URL = "https://world.openfoodfacts.org/api/v2/product/111.json"


def test_serving_grams_parses_g_and_ml():
    assert _serving_grams("30 g") == 30.0
    assert _serving_grams("200ml") == 200.0
    assert _serving_grams("1 biscuit (12.5 g)") == 12.5
    assert _serving_grams("") is None
    assert _serving_grams("a handful") is None


@respx.mock
def test_fetch_maps_fields_when_found():
    respx.get(URL).mock(return_value=httpx.Response(200, json={
        "status": 1,
        "product": {
            "product_name": "Chana", "brands": "Tata",
            "categories": "Snacks, Legumes, Roasted chickpeas",
            "ingredients_text": "Chickpeas, Salt",
            "nutriments": {"energy-kj_100g": 1500, "sugars_100g": 2,
                           "saturated-fat_100g": 0.5, "salt_100g": 0.3,
                           "fiber_100g": 5, "proteins_100g": 9},
        },
    }))
    client = OpenFoodFactsClient()
    result = client.fetch("111")
    assert result["name"] == "Chana"
    assert result["brand"] == "Tata"
    assert result["category"] == "roasted chickpeas"  # most-specific, normalized
    assert "chickpeas" in result["ingredients"]
    assert result["nutrition"]["sugars_g"] == 2
    assert result["nutrition"]["fibre_g"] == 5

@respx.mock
def test_fetch_reads_category_from_tags_with_lang_prefix():
    respx.get(URL).mock(return_value=httpx.Response(200, json={
        "status": 1,
        "product": {
            "product_name": "X", "brands": "Y",
            "categories_tags": ["en:snacks", "en:potato-chips"],
            "ingredients_text": "Potato",
            "nutriments": {"sugars_100g": 1},
        },
    }))
    assert OpenFoodFactsClient().fetch("111")["category"] == "potato chips"

@respx.mock
def test_fetch_returns_none_when_not_found():
    respx.get(URL).mock(return_value=httpx.Response(200, json={"status": 0}))
    assert OpenFoodFactsClient().fetch("111") is None

@respx.mock
def test_fetch_returns_none_on_http_error():
    respx.get(URL).mock(return_value=httpx.Response(500))
    assert OpenFoodFactsClient().fetch("111") is None


@respx.mock
def test_fetch_returns_front_image_url():
    respx.get(URL).mock(return_value=httpx.Response(200, json={
        "status": 1,
        "product": {
            "product_name": "Chana", "brands": "Tata",
            "ingredients_text": "Chickpeas",
            "image_front_url": "https://img.off/front.jpg",
            "nutriments": {"sugars_100g": 2},
        },
    }))
    assert OpenFoodFactsClient().fetch("111")["image_url"] == "https://img.off/front.jpg"


@respx.mock
def test_fetch_image_url_empty_when_absent():
    respx.get(URL).mock(return_value=httpx.Response(200, json={
        "status": 1,
        "product": {"product_name": "X", "brands": "Y",
                    "ingredients_text": "Potato", "nutriments": {"sugars_100g": 1}},
    }))
    assert OpenFoodFactsClient().fetch("111")["image_url"] == ""


@respx.mock
def test_fetch_includes_serving_size_g():
    respx.get(URL).mock(return_value=httpx.Response(200, json={
        "status": 1,
        "product": {
            "product_name": "Chana", "brands": "Tata",
            "serving_size": "30 g",
            "ingredients_text": "Chickpeas",
            "nutriments": {"sugars_100g": 2},
        },
    }))
    result = OpenFoodFactsClient().fetch("111")
    assert result["serving_size_g"] == 30.0


@respx.mock
def test_fetch_serving_size_g_none_when_absent():
    respx.get(URL).mock(return_value=httpx.Response(200, json={
        "status": 1,
        "product": {
            "product_name": "X", "brands": "Y",
            "ingredients_text": "Potato",
            "nutriments": {"sugars_100g": 1},
        },
    }))
    result = OpenFoodFactsClient().fetch("111")
    assert result["serving_size_g"] is None
