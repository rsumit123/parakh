"""Estimate nutrients for an unpackaged meal photo via an OpenRouter vision model.
Mirrors LabelExtractor: returns {name, portion_g, per100g{6 macros}}. The macros are
PER 100 g so the client can re-scale to any confirmed portion."""
import base64
import json
import httpx

_MACRO_KEYS = ("energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g")
_PROMPT = (
    "You are looking at a photo of a prepared/unpackaged meal (often Indian). Return "
    "ONLY a JSON object with keys: name (string, concise dish name), portion_g (number, "
    "your best estimate of the total grams of food shown), and nutrition (object with "
    "numeric PER-100g keys: energy_kj, sugars_g, sat_fat_g, salt_g, fibre_g, protein_g).\n"
    "- energy_kj must be kilojoules (kcal*4.184 if you reason in kcal).\n"
    "- Estimate typical home-cooked values. Use 0 only when truly negligible.\n"
    "No prose, JSON only."
)


class MealEstimateError(Exception):
    """Raised when the vision model output cannot be parsed into a meal estimate."""


def _per100g(n: dict) -> dict:
    g = lambda k: float(n.get(k, 0) or 0)
    return {k: g(k) for k in _MACRO_KEYS}


class MealEstimator:
    def __init__(self, api_key: str, model: str, url: str, timeout: float = 30.0):
        self._api_key = api_key
        self._model = model
        self._url = url
        self._timeout = timeout

    def estimate(self, image_bytes: bytes) -> dict:
        b64 = base64.b64encode(image_bytes).decode("ascii")
        body = {
            "model": self._model,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": _PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ]}],
            "response_format": {"type": "json_object"},
        }
        try:
            resp = httpx.post(self._url, json=body, timeout=self._timeout,
                              headers={"Authorization": f"Bearer {self._api_key}"})
        except httpx.HTTPError as e:
            raise MealEstimateError(str(e)) from e
        if resp.status_code != 200:
            raise MealEstimateError(f"openrouter status {resp.status_code}")
        try:
            content = resp.json()["choices"][0]["message"]["content"]
            data = json.loads(content)
        except (json.JSONDecodeError, KeyError, IndexError, TypeError) as e:
            raise MealEstimateError("model did not return JSON") from e
        if not isinstance(data, dict):
            raise MealEstimateError("model did not return a JSON object")
        return {
            "name": str(data.get("name", "") or "").strip() or "Meal",
            "portion_g": float(data.get("portion_g", 0) or 0) or 200.0,
            "per100g": _per100g(data.get("nutrition", {})),
        }
