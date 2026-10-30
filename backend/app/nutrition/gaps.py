"""Close-the-gap ideas: foods that fill the day's protein / fibre shortfall within
the calories left, preferring foods the user already eats.

Candidates are the user's regular foods (logged on 2+ occasions, at their usual
amount) plus a short list of easy staples. Each pick is scored by how much of the
remaining gaps it closes, discounted by its share of the calories left; picks are greedy, so the second idea covers what
the first one doesn't. Nothing that would push sugar, sat fat or salt over its
limit is suggested.
"""
from app.nutrition.foods import FOODS, per100g

KJ_PER_KCAL = 4.184
MIN_GAP = {"protein_g": 8.0, "fibre_g": 5.0}   # smaller shortfalls aren't worth a nudge
LIMITS = ("sugars_g", "sat_fat_g", "salt_g")
OWN_BONUS = 1.3   # a food you already eat beats a slightly better stranger
# (food id, pieces, grams): easy top-ups you'd add to a day, not whole meals
STAPLES = (
    ("boiled_egg", 2, None), ("curd", None, 200), ("sprouts_salad", None, 150),
    ("soya_chunks_curry", None, 100), ("chhena", None, 100), ("peanuts", None, 30),
    ("guava", 1, None), ("apple", 1, None), ("makhana", None, 30), ("milk", None, 250),
)


def _amounts(per100: dict, grams: float) -> dict:
    return {k: (0.0 if v is None else v * grams / 100) for k, v in per100.items()}


def _norm(s: str) -> str:
    return " ".join(s.lower().replace("×", " ").split())


def _candidates(own_foods: list[dict]) -> list[dict]:
    out = []
    for f in own_foods:
        if f.get("uses", 0) >= 2 and f.get("quantity_g"):
            out.append({"name": f["name"], "quantity_g": f["quantity_g"], "per100g": f["per100g"],
                        "kind": f.get("kind") or "manual", "own": True})
    mine = " | ".join(_norm(c["name"]) for c in out)
    for fid, count, grams in STAPLES:
        food = FOODS[fid]
        if _norm(food.name) in mine or _norm(food.name).rstrip("s") in mine:
            continue  # the user's own version is already a candidate
        g = count * food.unit_g if count else grams
        name = f"{food.name} ×{count}" if count and count > 1 else food.name
        out.append({"name": name, "quantity_g": g, "per100g": per100g(food), "kind": "unpackaged", "own": False})
    return out


def close_gaps(totals: dict, targets: dict, own_foods: list[dict], max_ideas: int = 3) -> dict:
    gaps = {k: targets[k] - totals[k] for k in MIN_GAP if targets[k] - totals[k] >= MIN_GAP[k]}
    kcal_left = (targets["energy_kj"] - totals["energy_kj"]) / KJ_PER_KCAL
    result = {"gaps": {k: round(v) for k, v in gaps.items()}, "kcal_left": round(kcal_left), "ideas": []}
    if not gaps:
        return result
    budget = max(kcal_left + 150, 250)  # a little over is fine; a low-calorie top-up always is
    room = {k: targets[k] - totals[k] for k in LIMITS}
    pool = _candidates(own_foods)
    left = dict(gaps)
    for _ in range(max_ideas):
        best, best_score = None, 0.0
        for c in pool:
            amt = _amounts(c["per100g"], c["quantity_g"])
            kcal = amt["energy_kj"] / KJ_PER_KCAL
            if kcal > budget or any(room[k] >= 0 and amt[k] > room[k] for k in LIMITS):
                continue
            fill = sum(min(amt[k], left[k]) / gaps[k] for k in left if left[k] > 0)
            if fill < 0.15:
                continue
            # calories only count against the budget left, so with room to spare the
            # food that closes most of the gap wins over a merely lighter one
            score = fill * (1 - 0.5 * kcal / budget) * (OWN_BONUS if c["own"] else 1.0)
            if score > best_score:
                best, best_score = (c, amt, kcal), score
        if not best:
            break
        c, amt, kcal = best
        pool.remove(c)
        for k in left:
            left[k] -= amt[k]
        result["ideas"].append({
            "name": c["name"], "quantity_g": round(c["quantity_g"], 1), "per100g": c["per100g"], "kind": c["kind"],
            "own": c["own"], "kcal": round(kcal), "protein_g": round(amt["protein_g"], 1), "fibre_g": round(amt["fibre_g"], 1),
        })
        if all(v <= 0 for v in left.values()):
            break
    return result
