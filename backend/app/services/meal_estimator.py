"""Estimate nutrients for an unpackaged meal photo via an OpenRouter vision model.
Returns {"items": [{name, portion_g, per100g{6 macros}}, ...]} — one item per distinct
dish (single dish = one-item list). The macros are PER 100 g so the client can re-scale
to any confirmed portion."""
import base64
import json
import re
import httpx

_MACRO_KEYS = ("energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g")
_PROMPT = (
    "You are looking at a photo of an Indian meal that may contain ONE OR SEVERAL dishes "
    "(e.g. a thali or combo plate). Identify EVERY distinct dish. Return ONLY a JSON object "
    "of the form {\"items\": [ ... ]} where each item is "
    "{\"name\": str, \"portion_g\": number, \"nutrition\": {...}}.\n"
    "- name: the SPECIFIC dish name (e.g. 'Dal Tadka', 'Jeera Rice', 'Gulab Jamun'), NOT a generic "
    "description.\n"
    "- portion_g: ONE typical single-person serving of THAT dish (NOT the whole platter).\n"
    "- nutrition: PER-100g numbers: energy_kj, sugars_g, sat_fat_g, salt_g, fibre_g, protein_g.\n"
    "If only one dish is present, return a single-item list.\n"
    "Anchor each portion_g to one serving: curry/sabzi/dal ~200 g; rice or biryani ~250 g; a glass "
    "of lassi/juice/drink ~250 ml; one roti/naan/paratha ~55 g; a dessert (barfi/gulab jamun/kulfi/"
    "rasmalai) ~90 g; a fried snack (samosa/vada/pakora) ~60 g per piece.\n"
    "energy_kj in kilojoules (kcal*4.184). Use 0 only when truly negligible. No prose, JSON only."
)


class MealEstimateError(Exception):
    """Raised when the vision model output cannot be parsed into a meal estimate."""


def _per100g(n: dict) -> dict:
    g = lambda k: float(n.get(k, 0) or 0)
    return {k: g(k) for k in _MACRO_KEYS}


# Sane per-serving bounds (default, min, max) in grams, chosen by dish type from the
# name. A backstop: if the model returns an absurd portion (e.g. a 1000 g "lassi" =
# the whole jug), we snap it to a typical single serving so logged totals stay real.
def _portion_bounds(name: str):
    n = (name or "").lower()
    if re.search(r"\b(juice|lassi|shake|smoothie|coffee|latte|tea|chai|soda|cola|drink|"
                 r"water|buttermilk|chaas|milk|lemonade|sharbat|nimbu|kombucha|mocktail|"
                 r"cocktail|sherbet)\b", n):
        return (250.0, 100.0, 600.0)
    if re.search(r"\b(barfi|burfi|gulab jamun|jamun|kulfi|rasmalai|rasgulla|halwa|ladoo|"
                 r"laddu|jalebi|kalakand|peda|sandesh|mithai|sweet|dessert)\b", n):
        return (90.0, 30.0, 250.0)
    if re.search(r"\b(naan|roti|chapati|chapathi|paratha|kulcha|bhatura|poori|puri|idli|"
                 r"dosa|uttapam|bread)\b", n):
        return (90.0, 25.0, 300.0)
    if re.search(r"\b(samosa|vada|pakora|pakoda|bhaji|tikki|cutlet|bonda|kachori|chaat)\b", n):
        return (120.0, 40.0, 350.0)
    return (300.0, 80.0, 700.0)  # curries, dals, rice, biryani, everything else


def _clamp_portion(name: str, portion: float) -> float:
    """Keep the model's portion if reasonable, else snap to a typical serving."""
    default, lo, hi = _portion_bounds(name)
    if portion <= 0 or portion < lo or portion > hi:
        return default
    return portion


def _one_item(d: dict) -> dict:
    name = str(d.get("name", "") or "").strip() or "Item"
    portion = float(d.get("portion_g", 0) or 0) or 200.0
    return {"name": name, "portion_g": _clamp_portion(name, portion),
            "per100g": _per100g(d.get("nutrition", {}))}


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
        raw = data.get("items")
        if not isinstance(raw, list) or not raw:
            # tolerate a legacy single-object response {name, portion_g, nutrition}
            raw = [data] if (data.get("name") or isinstance(data.get("nutrition"), dict)) else []
        items = [_one_item(d) for d in raw if isinstance(d, dict)]
        if not items:
            items = [{"name": "Meal", "portion_g": 200.0, "per100g": _per100g({})}]
        return {"items": items}
