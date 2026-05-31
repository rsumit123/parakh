import base64
import json
import httpx

_PROMPT = (
    "You are reading a packaged food label. Return ONLY a JSON object with keys: "
    "name (string), brand (string), ingredients (array of lowercase strings), and "
    "nutrition (object with numeric per-100g keys: energy_kj, sugars_g, sat_fat_g, "
    "salt_g, fibre_g, protein_g). Use 0 for any value you cannot read. No prose."
)


class ExtractionError(Exception):
    """Raised when the vision model output cannot be parsed into label data."""


def _normalize_nutrition(n: dict) -> dict:
    g = lambda k: float(n.get(k, 0) or 0)
    return {
        "energy_kj": g("energy_kj"), "sugars_g": g("sugars_g"),
        "sat_fat_g": g("sat_fat_g"), "salt_g": g("salt_g"),
        "fibre_g": g("fibre_g"), "protein_g": g("protein_g"),
        "fruit_veg_nuts_pct": g("fruit_veg_nuts_pct"),
    }


class LabelExtractor:
    """Extracts structured label data from an image via an OpenRouter vision model.
    The model is swappable via the `model` argument (config-driven)."""

    def __init__(self, api_key: str, model: str, url: str, timeout: float = 30.0):
        self._api_key = api_key
        self._model = model
        self._url = url
        self._timeout = timeout

    def extract(self, image_bytes: bytes) -> dict:
        b64 = base64.b64encode(image_bytes).decode("ascii")
        body = {
            "model": self._model,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": _PROMPT},
                    {"type": "image_url",
                     "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                ],
            }],
            "response_format": {"type": "json_object"},
        }
        try:
            resp = httpx.post(self._url, json=body, timeout=self._timeout,
                              headers={"Authorization": f"Bearer {self._api_key}"})
        except httpx.HTTPError as e:
            raise ExtractionError(str(e)) from e
        if resp.status_code != 200:
            raise ExtractionError(f"openrouter status {resp.status_code}")
        try:
            content = resp.json()["choices"][0]["message"]["content"]
        except (json.JSONDecodeError, KeyError, IndexError, TypeError) as e:
            raise ExtractionError("unexpected OpenRouter response shape") from e
        try:
            data = json.loads(content)
        except (json.JSONDecodeError, TypeError) as e:
            raise ExtractionError("model did not return JSON") from e
        if not isinstance(data, dict):
            raise ExtractionError("model did not return a JSON object")
        raw_ingredients = data.get("ingredients")
        if not isinstance(raw_ingredients, list):
            raw_ingredients = []
        return {
            "name": data.get("name", "") or "",
            "brand": data.get("brand", "") or "",
            "ingredients": [str(i).lower() for i in raw_ingredients],
            "nutrition": _normalize_nutrition(data.get("nutrition", {})),
        }
