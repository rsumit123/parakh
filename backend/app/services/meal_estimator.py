"""Estimate nutrients for an unpackaged meal photo via an OpenRouter vision model.

The model identifies foods (as ids from the reference table in app.nutrition.foods)
and portions (piece counts for countable foods, grams for the rest); nutrition comes
from the table, so the same dish always gets the same numbers. Foods outside the
table fall back to the model's own per-100 g estimate.

Returns {"items": [{name, portion_g, per100g, food_id?, count?}, ...]}. Macros are
PER 100 g so the client can re-scale to any confirmed portion."""
import json
import re
import httpx

from app.images import data_url
from app.llm_json import strip_fences
from app.nutrition.foods import FOODS, per100g, menu

_MACRO_KEYS = ("energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g", "carbs_g", "fat_g")
_PROMPT_TEMPLATE = (
    "You are looking at a photo of food someone is about to eat, usually an Indian home meal. "
    "List EVERY distinct food item you can see. Do NOT list garnishes, herbs, whole spices, chillies "
    "or lime wedges; list raw onion only when it is served as a side. Never return an empty list when "
    "food is visible, but if the photo shows no food (an object, a screen, a person, a blank or dark "
    "frame) return {{\"items\": []}} rather than guessing. Return ONLY a JSON object "
    "{{\"items\": [ ... ]}}.\n"
    "For each item:\n"
    "- \"food\": the closest id from this list: {menu}. Pick the closest even if not exact (any dry "
    "vegetable curry without a better id -> mixed_veg_sabzi; any paneer dish without a better id -> "
    "paneer_sabzi). Use \"other\" only when nothing is close, and then ALSO give \"nutrition\" per "
    "100 g: energy_kj, protein_g, carbs_g, fat_g, fibre_g, sugars_g, sat_fat_g, salt_g.\n"
    "- \"name\": the specific dish name to show the user (e.g. 'Methi Paneer', 'Arhar Dal').\n"
    "PORTIONS: estimate what is actually on THIS plate, not a standard serving.\n"
    "- For ids marked (per piece) give \"count\": count every piece, including rotis stacked or "
    "folded on top of each other (look at the edges), eggs, idlis, and each individual nut or raisin.\n"
    "- For everything else give \"grams\". A steel katori filled near the brim holds about 200 g of "
    "dal, curd or curry (3/4 full ~150 g, half ~100 g); a large serving bowl ~300 g; a mound of rice "
    "covering about a quarter of a thali ~200 g; a side heap of sabzi ~80-120 g; a palm-sized pile of "
    "paneer cubes ~100 g. Do NOT shrink portions because several dishes share one plate.\n"
    "Tell apart: paneer (white/cream soft rectangular cubes) vs potato (yellow, irregular, starchy); "
    "chhena (crumbly white curds sitting in watery whey) vs curd/dahi (smooth set yogurt); plain roti "
    "(thin, dry, brown spots) vs paratha (layered, oily, shiny) vs bajra/jowar roti (thicker, darker, "
    "coarse); plain boiled rice vs jeera rice (visible cumin) vs pulao (vegetables, whole spices).\n"
    "No prose, JSON only."
)


def _prompt() -> str:
    return _PROMPT_TEMPLATE.format(menu=menu())


class MealEstimateError(Exception):
    """Raised when the vision model output cannot be parsed into a meal estimate."""


def _per100g(n: dict) -> dict:
    def g(k):
        v = n.get(k)
        if v is None and k in ("carbs_g", "fat_g"):
            return None  # unknown, not zero
        return float(v or 0)
    return {k: g(k) for k in _MACRO_KEYS}


# Sane per-serving bounds (default, min, max) in grams, chosen by dish type from the
# name. A backstop: if the model returns an absurd portion (e.g. a 1000 g "lassi" =
# the whole jug), we snap it to a typical single serving so logged totals stay real.
def _portion_bounds(name: str):
    n = (name or "").lower()
    if re.search(r"\b(juice|lassi|shake|smoothie|coffee|latte|tea|chai|soda|cola|drink|"
                 r"water|buttermilk|chaas|milk|lemonade|sharbat|nimbu|kombucha|mocktail|"
                 r"cocktail|sherbet)\b", n):
        return (250.0, 40.0, 600.0)
    if re.search(r"\b(barfi|burfi|gulab jamun|jamun|kulfi|rasmalai|rasgulla|halwa|ladoo|"
                 r"laddu|jalebi|kalakand|peda|sandesh|mithai|sweet|dessert)\b", n):
        return (90.0, 15.0, 250.0)
    if re.search(r"\b(naan|roti|chapati|chapathi|paratha|kulcha|bhatura|poori|puri|idli|"
                 r"dosa|uttapam|bread|papad|papadum)\b", n):
        return (55.0, 12.0, 300.0)
    if re.search(r"\b(almonds?|cashews?|kaju|badam|pistachios?|pista|walnuts?|akhrot|raisins?|"
                 r"kishmish|dates?|khajur|figs?|anjeer|apricots?|peanuts?|nuts?|dry ?fruits?|"
                 r"makhana|trail mix|seeds?)\b", n):
        return (30.0, 5.0, 200.0)
    if re.search(r"\b(samosa|vada|pakora|pakoda|bhaji|tikki|cutlet|bonda|kachori|chaat)\b", n):
        return (60.0, 15.0, 350.0)
    return (200.0, 15.0, 700.0)  # curries, dals, rice, biryani, everything else


def _clamp_portion(name: str, portion: float) -> float:
    """Keep the model's portion if reasonable, else snap to a typical serving."""
    default, lo, hi = _portion_bounds(name)
    if portion <= 0 or portion < lo or portion > hi:
        return default
    return portion


# Garnishes the model sometimes lists as their own "item" (and then sizes as a 200 g
# serving). Dropped outright; the dish they sit on already carries their nutrition.
_GARNISH = re.compile(r"^(red |green )?(chill?i|chilli flakes|chili flakes|coriander|cilantro|"
                      r"mint leaves|curry leaves|turmeric( powder)?|lime|lemon|onion|salt|pepper|"
                      r"garnish|spices?)( wedges?| slices?| rings?| leaves| powder| flakes)?$")


# Placeholder names the model sometimes invents for a non-food photo; they'd log as
# a believable 120 kcal "dish", so they count as no food.
_PLACEHOLDER = re.compile(r"\b(unidentified|unknown|unrecogni[sz]ed|unclear|no food|not food|non[- ]food)\b")


def _is_placeholder(name: str) -> bool:
    return bool(_PLACEHOLDER.search((name or "").lower()))


def _is_garnish(name: str) -> bool:
    return bool(_GARNISH.match((name or "").strip().lower()))


def _num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _resolve(d: dict) -> dict:
    """Turn one model item into {name, portion_g, per100g[, food_id, count]}.

    Known foods take nutrition from the reference table; countable ones get grams
    from count x piece weight, others have the model's grams clamped to sane bounds.
    Unknown foods ("other", or no id) fall back to the model's own numbers."""
    fid = str(d.get("food") or "").strip().lower()
    food = FOODS.get(fid)
    if food is None:
        if "portion_g" not in d and "grams" in d:
            d = {**d, "portion_g": d["grams"]}
        return _one_item(d)
    name = str(d.get("name") or "").strip() or food.name
    count = _num(d.get("count"))
    if food.unit_g and count > 0:
        grams = round(count) * food.unit_g if food.unit_g >= 5 else count * food.unit_g
        item = {"name": name, "portion_g": round(grams, 1), "per100g": per100g(food),
                "food_id": fid, "count": round(count)}
        return item
    grams = _num(d.get("grams") or d.get("portion_g"))
    grams = food.default_g if grams <= 0 else min(max(grams, food.min_g), food.max_g)
    return {"name": name, "portion_g": round(grams, 1), "per100g": per100g(food), "food_id": fid}


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
        body = {
            "model": self._model,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": _prompt()},
                {"type": "image_url", "image_url": {"url": data_url(image_bytes)}},
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
            data = json.loads(strip_fences(content))
        except (json.JSONDecodeError, KeyError, IndexError, TypeError) as e:
            raise MealEstimateError("model did not return JSON") from e
        if not isinstance(data, dict):
            raise MealEstimateError("model did not return a JSON object")
        raw = data.get("items")
        if not isinstance(raw, list) or not raw:
            # tolerate a legacy single-object response {name, portion_g, nutrition}
            raw = [data] if (data.get("name") or isinstance(data.get("nutrition"), dict)) else []
        items = [_resolve(d) for d in raw
                 if isinstance(d, dict) and not _is_garnish(str(d.get("name", "")))
                 and not _is_placeholder(str(d.get("name", "")))]
        # No food found, or no nutrition at all: fail so the client asks for a retake,
        # instead of showing a believable-looking 0 kcal estimate.
        items = [i for i in items if any(i["per100g"].values())]
        if not items:
            raise MealEstimateError("no food with nutrition in photo")
        return {"items": items}
