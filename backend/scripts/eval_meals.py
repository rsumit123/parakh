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
        per = r["per100g"]
        grade = score_fn([], {**per, "fruit_veg_nuts_pct": 0}, "")["grade"]
        ok = name_matches(truth, r["name"])
        hits += ok
        kcal = round(per["energy_kj"] / 4.184)
        print(f"{'OK  ' if ok else 'MISS'} | true: {truth:24} | pred: {r['name'][:30]:30} | "
              f"{r['portion_g']:>4.0f}g | {kcal:>4}kcal "
              f"s{per['sugars_g']:>4.0f} p{per['protein_g']:>4.0f} f{per['fibre_g']:>4.0f} | {grade}")
        results.append({"file": os.path.basename(f), "truth": truth, "pred": r["name"],
                        "match": ok, "portion_g": r["portion_g"], "kcal_100": kcal,
                        "per100g": per, "grade": grade})

    n = len(results)
    print(f"\nname-match (loose): {hits}/{n} = {round(100 * hits / n) if n else 0}%"
          f"  |  errors: {errs}")
    if args.json and results:
        with open(args.json, "w") as out:
            json.dump(results, out, indent=2)
        print(f"wrote {args.json}")


if __name__ == "__main__":
    main()
