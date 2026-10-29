import json
import httpx
import respx
import pytest
from app.clients.label_extractor import LabelExtractor, ExtractionError

URL = "https://openrouter.ai/api/v1/chat/completions"

def _openrouter_response(payload: dict) -> httpx.Response:
    return httpx.Response(200, json={
        "choices": [{"message": {"content": json.dumps(payload)}}]
    })

def _openrouter_response_raw(content: str) -> httpx.Response:
    return httpx.Response(200, json={
        "choices": [{"message": {"content": content}}]
    })

@respx.mock
def test_extract_parses_structured_json():
    respx.post(URL).mock(return_value=_openrouter_response({
        "name": "Chips", "brand": "Lays",
        "ingredients": ["Potato", "Palm Oil", "Salt"],
        "nutrition": {"energy_kj": 2200, "sugars_g": 2, "sat_fat_g": 11,
                      "salt_g": 1.6, "fibre_g": 3, "protein_g": 6},
    }))
    ext = LabelExtractor(api_key="k", model="m", url=URL)
    result = ext.extract(b"fakeimage")
    assert result["name"] == "Chips"
    assert "palm oil" in result["ingredients"]
    assert result["nutrition"]["sat_fat_g"] == 11

@respx.mock
def test_extract_raises_on_unparseable_content():
    respx.post(URL).mock(return_value=httpx.Response(200, json={
        "choices": [{"message": {"content": "sorry I cannot read this"}}]
    }))
    ext = LabelExtractor(api_key="k", model="m", url=URL)
    with pytest.raises(ExtractionError):
        ext.extract(b"fakeimage")

@respx.mock
def test_extract_raises_on_http_error():
    respx.post(URL).mock(return_value=httpx.Response(500))
    ext = LabelExtractor(api_key="k", model="m", url=URL)
    with pytest.raises(ExtractionError):
        ext.extract(b"fakeimage")

@respx.mock
def test_extract_raises_on_malformed_200_response():
    respx.post(URL).mock(return_value=httpx.Response(200, json={"choices": []}))
    ext = LabelExtractor(api_key="k", model="m", url=URL)
    with pytest.raises(ExtractionError):
        ext.extract(b"fakeimage")

@respx.mock
def test_extract_raises_when_content_is_json_but_not_object():
    respx.post(URL).mock(return_value=_openrouter_response_raw("[1, 2, 3]"))
    ext = LabelExtractor(api_key="k", model="m", url=URL)
    with pytest.raises(ExtractionError):
        ext.extract(b"fakeimage")

@respx.mock
def test_extract_tolerates_non_list_ingredients():
    respx.post(URL).mock(return_value=_openrouter_response({
        "name": "X", "brand": "Y", "ingredients": "potato, salt",
        "nutrition": {"sugars_g": 1},
    }))
    ext = LabelExtractor(api_key="k", model="m", url=URL)
    result = ext.extract(b"fakeimage")
    assert result["ingredients"] == []
    assert result["nutrition"]["sugars_g"] == 1


def test_normalize_keeps_carbs_fat_and_marks_missing_unknown():
    from app.clients.label_extractor import _normalize_nutrition
    n = _normalize_nutrition({"energy_kj": 2000, "carbs_g": 60, "fat_g": "21.5"})
    assert n["carbs_g"] == 60.0 and n["fat_g"] == 21.5
    assert _normalize_nutrition({"energy_kj": 2000})["carbs_g"] is None


def test_extract_accepts_json_in_code_fences(monkeypatch):
    import json as _json
    from app.clients.label_extractor import LabelExtractor
    payload = {"name": "Biscuit", "brand": "B", "category": "biscuits", "ingredients": ["wheat"],
               "nutrition": {"energy_kj": 2000, "sugars_g": 20, "sat_fat_g": 8, "salt_g": 1,
                             "fibre_g": 2, "protein_g": 7}}

    class R:
        status_code = 200
        def json(self): return {"choices": [{"message": {"content": "```json\n" + _json.dumps(payload) + "\n```"}}]}

    monkeypatch.setattr("app.clients.label_extractor.httpx.post", lambda *a, **k: R())
    assert LabelExtractor(api_key="k", model="m", url="u").extract(b"x")["name"] == "Biscuit"
