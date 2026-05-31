"""Seed curated products into the Parakh DB.

Each product is scored through the REAL scorer and upserted via ProductRepository,
so seeded items are identical in shape to live scans. Idempotent: re-running upserts
by barcode. Nutrition is per-100g; energy in kJ, salt in grams (already converted
from the label's kcal / sodium-mg).

Run inside the backend container:
    docker exec parakh-backend python -m scripts.seed_products
"""
from app.config import get_settings
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository
from app.scoring.scorer import score as score_fn


# barcode "" means no barcode (category-only). Nutrition keys are per 100g.
PRODUCTS = [
    {
        "barcode": "7622202253676",
        "name": "Oreo Chocolate Sandwich Biscuit",
        "brand": "Cadbury",
        "category": "biscuits",
        "ingredients": [
            "refined wheat flour (maida)", "sugar", "fractionated fat", "palmolein",
            "invert sugar", "cocoa solids", "leavening agents (500ii, 503ii)",
            "starch", "iodised salt", "emulsifier (322)",
            "nature identical flavouring substances",
        ],
        "nutrition": {"energy_kj": 2020.9, "sugars_g": 38.9, "sat_fat_g": 9.7,
                      "salt_g": 1.05, "fibre_g": 0.0, "protein_g": 5.2,
                      "fruit_veg_nuts_pct": 0.0},
    },
    {
        "barcode": "8901719117220",
        "name": "Hide & Seek Chocolate Chip Cookies",
        "brand": "Parle",
        "category": "biscuits",
        "ingredients": [
            "wheat flour", "chocolate (23%)", "sugar", "cocoa solids", "cocoa butter",
            "dextrose", "emulsifier (lecithin of soya origin)", "edible vegetable oil (palm oil)",
            "invert sugar syrup", "raising agents (503ii, 500ii)", "iodised salt",
            "artificial flavouring substances (vanilla)",
        ],
        # Panel listed no sodium -> salt recorded as 0 (slightly kinder than reality).
        "nutrition": {"energy_kj": 2004.1, "sugars_g": 32.2, "sat_fat_g": 9.4,
                      "salt_g": 0.0, "fibre_g": 0.0, "protein_g": 5.9,
                      "fruit_veg_nuts_pct": 0.0},
    },
    {
        "barcode": "",  # no barcode captured for this pack
        "name": "Britannia 50-50 Maska Chaska",
        "brand": "Britannia",
        "category": "biscuits",
        "ingredients": [
            "refined wheat flour (maida)", "refined palm & palmolein oil", "sugar",
            "liquid glucose", "raising agents (503ii, 341ii, 500ii, 450i)", "butter",
            "black salt", "milk solids", "dehydrated vegetable (chives)", "iodised salt",
            "nature identical flavouring substance", "dough conditioner (223)",
        ],
        "nutrition": {"energy_kj": 2196.6, "sugars_g": 9.8, "sat_fat_g": 13.0,
                      "salt_g": 2.66, "fibre_g": 0.0, "protein_g": 7.7,
                      "fruit_veg_nuts_pct": 0.0},
    },
    {
        "barcode": "8901725004668",
        "name": "Sunfeast Farmlite Oats with Almonds Cookies",
        "brand": "Sunfeast",
        "category": "biscuits",
        "ingredients": [
            "wheat flour (atta)", "oat flakes", "refined palm oil", "sugar",
            "liquid glucose", "almonds", "raising agents (503ii, 500ii, 450i)",
            "maltodextrin", "invert syrup", "milk solids", "iodized salt",
            "artificial flavouring substances (milk, vanilla)",
            "emulsifier (lecithin from soyabean)", "nature identical flavouring substances",
        ],
        "nutrition": {"energy_kj": 2016.7, "sugars_g": 20.5, "sat_fat_g": 9.6,
                      "salt_g": 1.06, "fibre_g": 4.7, "protein_g": 12.3,
                      "fruit_veg_nuts_pct": 0.0},
    },

    # --- Namkeen / Indian savoury snacks (per-100g; converted from per-serving labels) ---
    {
        "barcode": "",  # FSSAI lic on pack; EAN not captured
        "name": "Bhujialalji Bikaneri Bhujia",
        "brand": "Bhujialalji",
        "category": "namkeen",
        # Ingredients not captured (cut off in label image) -> no palm-oil flag.
        "ingredients": [],
        # Label was per-40g serving -> x2.5 to per-100g.
        "nutrition": {"energy_kj": 2552.0, "sugars_g": 0.0, "sat_fat_g": 15.0,
                      "salt_g": 1.99, "fibre_g": 7.5, "protein_g": 15.0,
                      "fruit_veg_nuts_pct": 0.0},
    },
    {
        "barcode": "",
        "name": "Haldiram's Panchratan",
        "brand": "Haldiram's",
        "category": "namkeen",
        "ingredients": [
            "potatoes", "edible vegetable oil (cotton seed oil)", "raisins",
            "cashew nuts", "sugar powder", "almonds", "rice flakes", "sesame seeds",
            "iodised salt", "curry leaves", "black pepper powder", "cumin",
            "acidity regulator (ins 330)",
        ],
        # Salt not listed on panel -> 0 (slightly kinder than reality).
        "nutrition": {"energy_kj": 2292.8, "sugars_g": 2.5, "sat_fat_g": 8.0,
                      "salt_g": 0.0, "fibre_g": 0.0, "protein_g": 12.0,
                      "fruit_veg_nuts_pct": 0.0},
    },
    {
        "barcode": "",
        "name": "SpiceRaga Bikaneri Bhuja",
        "brand": "SpiceRaga",
        "category": "namkeen",
        "ingredients": [
            "moth flour", "gram flour", "groundnut oil", "edible salt", "red chilli",
            "black pepper", "mixed spices",
        ],
        "nutrition": {"energy_kj": 2500.0, "sugars_g": 1.37, "sat_fat_g": 7.84,
                      "salt_g": 2.34, "fibre_g": 0.0, "protein_g": 13.16,
                      "fruit_veg_nuts_pct": 0.0},
    },
    {
        "barcode": "8906120100663",
        "name": "Farmley Himalayan Salt Makhana",
        "brand": "Farmley",
        "category": "namkeen",
        "ingredients": ["foxnut (makhana)", "olive oil", "rock salt"],
        # Label per-100g directly.
        "nutrition": {"energy_kj": 2134.0, "sugars_g": 0.5, "sat_fat_g": 9.2,
                      "salt_g": 0.79, "fibre_g": 11.2, "protein_g": 7.8,
                      "fruit_veg_nuts_pct": 0.0},
    },
    {
        "barcode": "",
        "name": "Chheda's Mix Farsan",
        "brand": "Chheda's",
        "category": "namkeen",
        "ingredients": [
            "gram flour", "palm oil", "bengal gram", "edible starch",
            "red chilli powder", "bishops weed", "curry leaves", "salt",
        ],
        # Label per-70g serving -> x(100/70) to per-100g.
        "nutrition": {"energy_kj": 2510.0, "sugars_g": 2.9, "sat_fat_g": 18.6,
                      "salt_g": 0.27, "fibre_g": 7.1, "protein_g": 14.3,
                      "fruit_veg_nuts_pct": 0.0},
    },
    {
        "barcode": "8906013810419",
        "name": "Roasty Tasty Chana Flakes Namkeen",
        "brand": "Roasty Tasty",
        "category": "namkeen",
        "ingredients": [
            "bengal gram (chana) flakes", "rice bran oil", "seasoning mix",
            "iodised salt", "hydrolyzed vegetable protein (soy)",
            "acidity regulator (ins 330)", "lemon juice powder",
            "anticaking agent (silicon dioxide ins 551)",
            "added flavours (natural and nature identical)",
        ],
        # Label provided a per-100g column directly.
        "nutrition": {"energy_kj": 1828.0, "sugars_g": 8.1, "sat_fat_g": 2.7,
                      "salt_g": 1.9, "fibre_g": 9.1, "protein_g": 17.1,
                      "fruit_veg_nuts_pct": 0.0},
    },
]


def seed(repo: ProductRepository, products: list[dict]) -> None:
    for i, p in enumerate(products):
        scored = score_fn(p["ingredients"], p["nutrition"])
        # Barcode-less products get a stable synthetic key derived from the name so
        # re-running upserts the same row instead of duplicating.
        barcode = p["barcode"] or ("seed:" + p["name"].lower().replace(" ", "-"))
        repo.save(
            barcode=barcode, name=p["name"], brand=p["brand"], category=p["category"],
            ingredients=p["ingredients"], nutrition=p["nutrition"],
            score=scored, source="photo",  # stored like a normal scan, per your choice
        )
        print(f"  {scored['grade']} {scored['overall']:>3}/100  {p['name']}  "
              f"[{barcode}]  flags={[f['label'] for f in scored['breakdown']['india_flags']]}")


def main() -> None:
    settings = get_settings()
    engine = make_engine(settings.db_url)
    init_db(engine)
    repo = ProductRepository(make_session_factory(engine))
    print(f"Seeding {len(PRODUCTS)} products into {settings.db_url} ...")
    seed(repo, PRODUCTS)
    print("Done.")


if __name__ == "__main__":
    main()
