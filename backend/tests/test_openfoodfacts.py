import httpx
import respx
from app.clients.openfoodfacts import OpenFoodFactsClient

URL = "https://world.openfoodfacts.org/api/v2/product/111.json"

@respx.mock
def test_fetch_maps_fields_when_found():
    respx.get(URL).mock(return_value=httpx.Response(200, json={
        "status": 1,
        "product": {
            "product_name": "Chana", "brands": "Tata",
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
    assert "chickpeas" in result["ingredients"]
    assert result["nutrition"]["sugars_g"] == 2
    assert result["nutrition"]["fibre_g"] == 5

@respx.mock
def test_fetch_returns_none_when_not_found():
    respx.get(URL).mock(return_value=httpx.Response(200, json={"status": 0}))
    assert OpenFoodFactsClient().fetch("111") is None

@respx.mock
def test_fetch_returns_none_on_http_error():
    respx.get(URL).mock(return_value=httpx.Response(500))
    assert OpenFoodFactsClient().fetch("111") is None
