"""Calorie/portion accuracy scorecard for the meal estimator.

Complements eval_meals.py (which only checks dish names). Each case is a meal photo
with owner-confirmed truth: total kcal, protein and what's on the plate. The photos
are personal, so the eval set lives outside the repo (on the VM under
~/parakh-eval/, copied into the container at run time).

    docker exec -w /app -e PYTHONPATH=/app parakh-backend \
        python -m scripts.eval_meal_accuracy --dir /tmp/eval [--repeat 2]

Reports, per meal: estimated kcal vs truth (% error), protein, and roti count;
then the mean/median absolute kcal error and how many meals land within 20%.
The model is non-deterministic, so --repeat runs each photo several times and
averages.
"""
import argparse
import json
import os
import re
import statistics

from app.config import get_settings
from app.services.meal_estimator import MealEstimator, MealEstimateError

ROTI_RE = re.compile(r"\b(roti|chapati|chapathi|phulka|paratha|bhakri|naan)s?\b", re.I)


def totals(est: dict) -> tuple[float, float, float]:
    """kcal, protein (g), roti count for an estimate."""
    kcal = protein = rotis = 0.0
    for it in est["items"]:
        p, g = it["per100g"], it["portion_g"]
        kcal += (p.get("energy_kj") or 0) * g / 100 / 4.184
        protein += (p.get("protein_g") or 0) * g / 100
        if ROTI_RE.search(it["name"]):
            # new estimator reports counts; older one only grams (~40 g per roti)
            rotis += it.get("count") or round(g / 40)
    return kcal, protein, rotis


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="folder with truth.json and the photos")
    ap.add_argument("--repeat", type=int, default=1)
    args = ap.parse_args()

    s = get_settings()
    est = MealEstimator(api_key=s.openrouter_api_key, model=s.vision_model, url=s.openrouter_url)
    cases = json.load(open(os.path.join(args.dir, "truth.json")))["cases"]
    errs, prot_errs = [], []
    print(f"model: {s.vision_model} | {len(cases)} meals x{args.repeat}\n")
    for c in cases:
        img = open(os.path.join(args.dir, c["photo"]), "rb").read()
        runs = []
        for _ in range(args.repeat):
            try:
                runs.append(est.estimate(img))
            except MealEstimateError as e:
                print(f"  {c['id']:<16} ERROR {e}")
        if not runs:
            continue
        ks, ps, rs = zip(*(totals(r) for r in runs))
        k, p, r = statistics.mean(ks), statistics.mean(ps), statistics.mean(rs)
        err = (k - c["kcal"]) / c["kcal"] * 100
        errs.append(abs(err))
        prot_errs.append(abs(p - c["protein_g"]))
        truth_rotis = sum(c.get("counts", {}).values())
        names = ", ".join(f"{i['name']} {i['portion_g']:.0f}g" for i in runs[0]["items"])
        print(f"  {c['id']:<16} kcal {k:5.0f} vs {c['kcal']:4d} ({err:+5.0f}%)  protein {p:4.0f} vs {c['protein_g']:4.0f}"
              f"  rotis {r:.0f}/{truth_rotis}  | {names}")
    if errs:
        print(f"\nkcal abs error: mean {statistics.mean(errs):.0f}%  median {statistics.median(errs):.0f}%"
              f"  within 20%: {sum(e <= 20 for e in errs)}/{len(errs)}"
              f"  | protein abs error: mean {statistics.mean(prot_errs):.1f} g")


if __name__ == "__main__":
    main()
