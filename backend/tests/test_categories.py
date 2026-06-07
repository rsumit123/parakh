from app.categories import normalize_category


def test_drinks_bucket_catches_sodas_and_juice():
    assert normalize_category("soft drink") == "drinks"
    assert normalize_category("mango juice") == "drinks"


def test_milk_based_drinks_are_dairy_not_drinks():
    # For "Healthier options" a milk drink should compare against yogurt/dahi, not
    # sodas/juices — so buttermilk/lassi/flavoured milk live in dairy.
    assert normalize_category("flavoured milk") == "dairy"
    assert normalize_category("rose flavoured milk") == "dairy"
    assert normalize_category("buttermilk") == "dairy"
    assert normalize_category("masti buttermilk chaas") == "dairy"
    assert normalize_category("lassi") == "dairy"


def test_namkeen_bucket():
    assert normalize_category("potato chips") == "chips"  # chips split into its own bucket
    assert normalize_category("bikaneri bhujia") == "namkeen"
    assert normalize_category("roasted makhana") == "namkeen"


def test_biscuits_and_chocolate():
    assert normalize_category("cream biscuits") == "biscuits"
    assert normalize_category("chocolate") == "chocolate"
    assert normalize_category("dark chocolate") == "chocolate"


def test_spreads_before_chocolate():
    # Nutella-style: should be a spread (competes with jam/peanut butter), not chocolate.
    assert normalize_category("chocolate hazelnut spread") == "spreads & sauces"
    assert normalize_category("peanut butter") == "spreads & sauces"


def test_plain_dairy_and_milk_chocolate():
    assert normalize_category("milk") == "dairy"
    assert normalize_category("paneer") == "dairy"
    # bare "milk" must NOT pull milk chocolate / milk bread out of their buckets
    assert normalize_category("milk chocolate") == "chocolate"
    assert normalize_category("milk bread") == "bread"


def test_condiments():
    assert normalize_category("chaat masala") == "condiments & spices"
    assert normalize_category("asafoetida") == "condiments & spices"


def test_breakfast_cereal_not_confused_with_chana_flakes():
    assert normalize_category("corn flakes") == "breakfast cereal"
    assert normalize_category("muesli") == "breakfast cereal"
    # "chana flakes namkeen" must stay namkeen (no bare 'flakes' keyword)
    assert normalize_category("chana flakes namkeen") == "namkeen"


def test_buckets_are_idempotent():
    for bucket in ["drinks", "namkeen", "biscuits", "chocolate", "breakfast cereal",
                   "noodles & pasta", "spreads & sauces", "condiments & spices",
                   "sweets", "dairy"]:
        assert normalize_category(bucket) == bucket, bucket


def test_name_fallback_when_category_missing():
    assert normalize_category("", "Rose Flavoured Milk") == "dairy"
    assert normalize_category("", "Dark Chocolate Bar") == "chocolate"


def test_unknown_category_returns_empty_not_raw():
    assert normalize_category("Frozen Paratha") == ""
    assert normalize_category("mobile game") == ""
    assert normalize_category("") == ""


def test_empty_when_nothing_known():
    assert normalize_category("", "") == ""


def test_new_phase2_category_buckets():
    from app.categories import normalize_category
    assert normalize_category("", "Amul Vanilla Ice Cream Tub") == "ice cream"
    assert normalize_category("", "Cadbury Bournvita Health Drink") == "health drinks"
    assert normalize_category("", "Horlicks Classic Malt") == "health drinks"


def test_chips_bread_dairy_buckets():
    from app.categories import normalize_category
    assert normalize_category("", "Lay's Classic Salted Potato Chips") == "chips"
    assert normalize_category("", "Modern Brown Bread Loaf") == "bread"
    assert normalize_category("", "Mother Dairy Classic Curd") == "dairy"
