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

    # --- Drinks / soft drinks (per-100ml, treated as per-100g; sugar dominates) ---
    {
        "barcode": "8901764112935",
        "name": "Coca-Cola Zero Sugar",
        "brand": "Coca-Cola",
        "category": "drinks",
        "ingredients": [
            "carbonated water", "acidity regulators (338, 331iii)",
            "sweeteners (955, 950)", "preservative (211)", "caffeine",
            "colour (150d)", "flavours (natural flavouring substances)",
        ],
        "nutrition": {"energy_kj": 0.0, "sugars_g": 0.0, "sat_fat_g": 0.0,
                      "salt_g": 0.019, "fibre_g": 0.0, "protein_g": 0.0,
                      "fruit_veg_nuts_pct": 0.0},
    },
    {
        "barcode": "8902080000333",
        "name": "Pepsi Black Zero Sugar",
        "brand": "Pepsi",
        "category": "drinks",
        "ingredients": [
            "carbonated water", "sweeteners (sucralose, acesulfame potassium)",
        ],
        "nutrition": {"energy_kj": 0.0, "sugars_g": 0.0, "sat_fat_g": 0.0,
                      "salt_g": 0.015, "fibre_g": 0.0, "protein_g": 0.0,
                      "fruit_veg_nuts_pct": 0.0},
    },
    {
        "barcode": "8902080120433",
        "name": "Mirinda (Reduced Sugar)",
        "brand": "Mirinda",
        "category": "drinks",
        "ingredients": [
            "carbonated water", "natural flavouring substances",
            "sweeteners (955, 960)", "preservative (211)", "stabilizer (444)",
            "colour (110)",
        ],
        "nutrition": {"energy_kj": 117.0, "sugars_g": 6.8, "sat_fat_g": 0.0,
                      "salt_g": 0.0175, "fibre_g": 0.0, "protein_g": 0.0,
                      "fruit_veg_nuts_pct": 0.0},
    },
    {
        "barcode": "",  # no barcode captured
        "name": "Coca-Cola (Original Taste)",
        "brand": "Coca-Cola",
        "category": "drinks",
        "ingredients": [
            "carbonated water", "sugar", "acidity regulator (338)", "caffeine",
            "colour (150d)", "flavours (natural flavouring substances)",
        ],
        "nutrition": {"energy_kj": 184.0, "sugars_g": 10.6, "sat_fat_g": 0.0,
                      "salt_g": 0.021, "fibre_g": 0.0, "protein_g": 0.0,
                      "fruit_veg_nuts_pct": 0.0},
    },
    {
        "barcode": "8902080104055",
        "name": "Pepsi (Original)",
        "brand": "Pepsi",
        "category": "drinks",
        "ingredients": [
            "carbonated water", "sugar", "colour (150d)", "acidity regulator (338)",
            "caffeine", "flavour (natural flavouring substances)", "stabilizer (436)",
        ],
        "nutrition": {"energy_kj": 180.0, "sugars_g": 10.9, "sat_fat_g": 0.0,
                      "salt_g": 0.0075, "fibre_g": 0.0, "protein_g": 0.0,
                      "fruit_veg_nuts_pct": 0.0},
    },

    # --- Chocolate (per-100g) ---
    {
        "barcode": "8000500411469",
        "name": "Ferrero Rocher Moments",
        "brand": "Ferrero Rocher",
        "category": "chocolate",
        "ingredients": [
            "sugar", "skimmed milk powder", "hazelnuts", "palmolein",
            "refined wheat flour (maida)", "refined salseed fat", "low fat cocoa powder",
            "palm oil", "wheat starch", "sunflowerseed oil", "whey protein concentrate",
            "emulsifier (lecithin ins 322)", "powdered barley malt extract",
            "raising agents (ins 503ii, ins 500ii)",
            "nature-identical flavouring substances", "iodized salt",
        ],
        "nutrition": {"energy_kj": 2201.0, "sugars_g": 45.5, "sat_fat_g": 11.6,
                      "salt_g": 0.18, "fibre_g": 1.6, "protein_g": 7.9,
                      "fruit_veg_nuts_pct": 0.0},
    },
    {
        "barcode": "8901030005905",
        "name": "Nestle KitKat",
        "brand": "Nestle",
        "category": "chocolate",
        "ingredients": [
            "sugar", "cocoa solids", "cocoa butter", "fractionated vegetable fat",
            "emulsifier (soya lecithin)", "artificial flavouring substances",
            "iodised salt", "wafer (refined wheat flour (maida))",
            "hydrogenated vegetable fats", "milk solids", "yeast",
            "raising agent (500ii)", "flour treatment agent (516)",
        ],
        "nutrition": {"energy_kj": 1937.0, "sugars_g": 41.5, "sat_fat_g": 24.1,
                      "salt_g": 0.067, "fibre_g": 4.3, "protein_g": 3.9,
                      "fruit_veg_nuts_pct": 0.0},
    },
    {
        "barcode": "7622202342196",
        "name": "Cadbury Dairy Milk Silk",
        "brand": "Cadbury",
        "category": "chocolate",
        "ingredients": [
            "sugar", "milk solids", "cocoa butter", "cocoa solids",
            "emulsifiers (442, 476)",
            "flavours (natural, nature identical and artificial vanilla)",
        ],
        "nutrition": {"energy_kj": 2272.0, "sugars_g": 55.3, "sat_fat_g": 21.5,
                      "salt_g": 0.31, "fibre_g": 0.0, "protein_g": 7.6,
                      "fruit_veg_nuts_pct": 0.0},
    },
    {
        "barcode": "8901262070676",
        "name": "Amul Dark Chocolate",
        "brand": "Amul",
        "category": "chocolate",
        "ingredients": [
            "sugar", "cocoa solids", "cocoa butter",
            "permitted emulsifiers (e322, e476)",
            "added flavours (artificial flavouring substances - cocoa & vanilla)",
        ],
        "nutrition": {"energy_kj": 2330.0, "sugars_g": 43.0, "sat_fat_g": 20.4,
                      "salt_g": 0.0, "fibre_g": 0.0, "protein_g": 6.0,
                      "fruit_veg_nuts_pct": 0.0},
    },
    {
        "barcode": "8901262071864",
        "name": "Amul 99% Cacao Dark Chocolate",
        "brand": "Amul",
        "category": "chocolate",
        "ingredients": ["cocoa solids", "permitted emulsifiers (e322, e476)"],
        "nutrition": {"energy_kj": 2456.0, "sugars_g": 0.0, "sat_fat_g": 25.7,
                      "salt_g": 0.0, "fibre_g": 0.0, "protein_g": 15.1,
                      "fruit_veg_nuts_pct": 0.0},
    },

    # --- Healthy dairy drinks (kept in 'drinks' so they surface vs sugary sodas) ---
    {
        "barcode": "8901262200233",
        "name": "Amul Masti Buttermilk (Chaas)",
        "brand": "Amul",
        "category": "drinks",
        "ingredients": [
            "milk solids", "iodised salt", "spices & condiments", "stabilizer (460i)",
        ],
        # Per 100ml.
        "nutrition": {"energy_kj": 121.0, "sugars_g": 1.8, "sat_fat_g": 1.0,
                      "salt_g": 0.625, "fibre_g": 0.0, "protein_g": 1.5,
                      "fruit_veg_nuts_pct": 0.0},
    },
]


def seed(repo: ProductRepository, products: list[dict]) -> None:
    for i, p in enumerate(products):
        scored = score_fn(p["ingredients"], p["nutrition"], p["category"])
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
