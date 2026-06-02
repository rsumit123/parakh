from scripts.catalog_build import (
    category_for_filename, clean_brand, derive_name, filter_own_images,
    validate_nutrition, pick_barcode, assemble_record, CATEGORY_MAP,
)

S3 = "https://sumits-private-storage.s3.amazonaws.com"


def test_category_for_filename_maps_all_four():
    assert category_for_filename("breakfast_products_sumits_private.json") == "breakfast cereal"
    assert category_for_filename("dark_chocolate_products.json") == "chocolate"
    assert category_for_filename("drinks_products.json") == "drinks"
    assert category_for_filename("namkeen_snacks_products.json") == "namkeen"
    assert category_for_filename("unknown.json") == ""


def test_clean_brand_strips_storefront_wrapping():
    assert clean_brand("Visit the Kellogg's Store") == "Kellogg's"
    assert clean_brand("Saffola Store") == "Saffola"
    assert clean_brand(None) == ""
    assert clean_brand("  Pintola  ") == "Pintola"
    assert clean_brand("Brand: Dairy Day") == "Dairy Day"
    assert clean_brand("Brand:Yakult") == "Yakult"


def test_derive_name_prefers_agent_then_cleans_title():
    assert derive_name("Kellogg's Chocos", "anything") == "Kellogg's Chocos"
    assert derive_name("", "Kellogg's Multigrain Chocos, 385G | More Chocolatey") == \
        "Kellogg's Multigrain Chocos"
    assert derive_name(None, "Pintola Oats 1kg | High Protein") == "Pintola Oats"


def test_filter_own_images_keeps_matching_asin_only():
    urls = [f"{S3}/breakfast/A1/x.jpg", f"{S3}/breakfast/A2/y.jpg", f"{S3}/breakfast/A1/z.jpg"]
    assert filter_own_images(urls, "A1") == [f"{S3}/breakfast/A1/x.jpg", f"{S3}/breakfast/A1/z.jpg"]


GOOD = {"energy_kj": 2022, "sugars_g": 1.6, "sat_fat_g": 5.0, "salt_g": 1.3,
        "fibre_g": 0, "protein_g": 18.9, "fruit_veg_nuts_pct": 0}


def test_validate_nutrition_accepts_plausible():
    assert validate_nutrition(GOOD, True, "high") == (True, "")


def test_validate_nutrition_rejects_each_failure_mode():
    assert validate_nutrition(GOOD, False, "high")[0] is False           # not found
    assert validate_nutrition(GOOD, True, "low")[0] is False             # low confidence
    assert validate_nutrition({**GOOD, "energy_kj": 99999}, True, "high")[0] is False
    assert validate_nutrition({**GOOD, "sugars_g": 250}, True, "high")[0] is False
    assert validate_nutrition({**GOOD, "protein_g": -1}, True, "high")[0] is False
    allzero = {k: 0 for k in GOOD}
    assert validate_nutrition(allzero, True, "high")[0] is False


def test_pick_barcode_takes_first_valid_ean_else_synthetic():
    decoded = [(f"{S3}/x/A1/a.jpg", "", "NONE"),
               (f"{S3}/x/A1/b.jpg", "8904063200365", "EAN13")]
    assert pick_barcode(decoded, "A1") == ("8904063200365", f"{S3}/x/A1/b.jpg")
    assert pick_barcode([], "A1") == ("amazon:A1", "")
    # non-digit / wrong format ignored
    assert pick_barcode([("u", "ABC", "CODE128")], "A1") == ("amazon:A1", "")


def test_assemble_record_builds_committed_shape():
    own = [f"{S3}/namkeen_snacks/A1/front.jpg", f"{S3}/namkeen_snacks/A1/nutri.jpg",
           f"{S3}/namkeen_snacks/A1/ingr.jpg"]
    agent = {"name": "Bombay Mix", "found_nutrition": True, "nutrition": GOOD,
             "ingredients": ["gram pulse"], "display_image_index": 0,
             "nutrition_image_index": 1, "ingredients_image_index": 2, "confidence": "high"}
    rec = assemble_record(asin="A1", title="Haldiram's Bombay Mix, 200g", raw_brand="Visit the Haldiram's Store",
                          category="namkeen", own_images=own, agent=agent,
                          barcode="8904063200365", barcode_image_url=f"{S3}/namkeen_snacks/A1/bar.jpg")
    assert rec["barcode"] == "8904063200365"
    assert rec["name"] == "Bombay Mix"
    assert rec["brand"] == "Haldiram's"
    assert rec["category"] == "namkeen"
    assert rec["display_image_url"] == own[0]
    assert rec["nutrition_image_url"] == own[1]
    assert rec["ingredients_image_url"] == own[2]
    assert rec["barcode_image_url"] == f"{S3}/namkeen_snacks/A1/bar.jpg"
