"""Accuracy scorecard for the unpackaged-meal vision estimator.

Drop labeled food photos in a folder (the TRUE dish name is taken from the filename),
run this, and get a scorecard: per-image predicted name vs truth, a loose name-match
rate, the chosen portion, and the per-100g nutrition + grade. Re-run it whenever you
change the prompt, the clamp, or the vision model to see if accuracy moved.

This calls the REAL OpenRouter vision API (costs a little, non-deterministic), so it is
NOT part of the pytest suite — run it by hand.

Filename -> true label: strips an optional `india-food-` / `indian-food-` prefix, a
trailing `-1120x732`-style size token, and turns separators into spaces. Examples:
  india-food-gulab-jamun-1120x732.jpg -> "gulab jamun"
  paneer_tikka.png                    -> "paneer tikka"

Usage (from backend/, with the OpenRouter key in the env):
  PARAKH_OPENROUTER_API_KEY=sk-or-... .venv/bin/python -m scripts.eval_meals \
      --dir ~/Downloads --glob 'india-food-*' [--limit N] [--json out.json]
The key also falls back to PARAKH_OPENROUTER_API_KEY from the app settings/.env.
"""
import argparse
import glob
import json
import os
import re

from app.config import get_settings
from app.services.meal_estimator import MealEstimator, MealEstimateError
from app.scoring.scorer import score as score_fn

# Words too generic to count as a correct match on their own.
_GENERIC = {"chicken", "curry", "masala", "fish", "rice", "indian", "food", "with",
            "and", "of", "gravy", "spiced", "dish", "fried", "sauce", "a", "the",
            "veg", "vegetable", "mixed", "assorted", "style", "plate", "bowl"}


def true_label(path: str) -> str:
    name = os.path.splitext(os.path.basename(path))[0]
    name = re.sub(r"^(india|indian)[-_]food[-_]", "", name, flags=re.I)
    name = re.sub(r"[-_]\d{2,4}\s*[xX]\s*\d{2,4}$", "", name)  # strip a size suffix
    return re.sub(r"[-_]+", " ", name).strip().lower()


def _toks(s: str) -> set:
    return set(re.sub(r"[^a-z ]", " ", (s or "").lower()).split())


def name_matches(truth: str, pred: str) -> bool:
    t, p = _toks(truth), _toks(pred)
    if not t or not p:
        return False
    if t <= p or p <= t:          # one is a subset of the other
        return True
    return bool((t & p) - _GENERIC)  # share a non-generic word


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="~/Downloads", help="folder of labeled images")
    ap.add_argument("--glob", default="india-food-*", help="filename glob to match")
    ap.add_argument("--limit", type=int, default=0, help="cap number of images (0=all)")
    ap.add_argument("--json", default="", help="optional path to dump raw results as JSON")
    args = ap.parse_args()

    settings = get_settings()
    key = os.environ.get("PARAKH_OPENROUTER_API_KEY") or settings.openrouter_api_key
    if not key:
        print("No OpenRouter key. Set PARAKH_OPENROUTER_API_KEY in the env.")
        return
    est = MealEstimator(api_key=key, model=settings.vision_model, url=settings.openrouter_url)

    pattern = os.path.join(os.path.expanduser(args.dir), args.glob)
    files = sorted(f for f in glob.glob(pattern)
                   if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
    if args.limit:
        files = files[:args.limit]
    if not files:
        print(f"No images matched {pattern}")
        return

    print(f"model: {settings.vision_model} | {len(files)} images\n")
    _MACRO_KEYS = ("energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g")
    results, hits, errs = [], 0, 0
    for f in files:
        truth = true_label(f)
        try:
            with open(f, "rb") as fh:
                r = est.estimate(fh.read())
        except (MealEstimateError, OSError) as e:
            errs += 1
            print(f"ERR  | {truth:24} | {e}")
            continue
        items = r["items"]
        combined_name = ", ".join(i["name"] for i in items)
        total_g = sum(i["portion_g"] for i in items)
        total_kcal = sum(i["per100g"]["energy_kj"] / 4.184 * i["portion_g"] / 100 for i in items)
        total_protein = sum(i["per100g"]["protein_g"] * i["portion_g"] / 100 for i in items)
        combined_per100g = {
            k: (sum(i["per100g"][k] * i["portion_g"] for i in items) / total_g if total_g else 0)
            for k in _MACRO_KEYS
        }
        grade = score_fn([], {**combined_per100g, "fruit_veg_nuts_pct": 0}, "")["grade"]
        ok = any(name_matches(truth, i["name"]) for i in items)
        hits += ok
        print(f"{'OK  ' if ok else 'MISS'} | true: {truth:24} | items: {combined_name[:40]:40} | "
              f"n={len(items)} | {round(total_kcal):>4}kcal total p{total_protein:>4.0f}g | {grade}")
        results.append({"file": os.path.basename(f), "truth": truth,
                        "items": [{"name": i["name"], "portion_g": i["portion_g"]} for i in items],
                        "n_items": len(items), "match": ok,
                        "total_kcal": round(total_kcal, 1),
                        "combined_per100g": combined_per100g, "grade": grade})

    n = len(results)
    print(f"\nname-match (loose): {hits}/{n} = {round(100 * hits / n) if n else 0}%"
          f"  |  errors: {errs}")
    if args.json and results:
        with open(args.json, "w") as out:
            json.dump(results, out, indent=2)
        print(f"wrote {args.json}")


if __name__ == "__main__":
    main()
