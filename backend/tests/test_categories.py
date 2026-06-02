from app.categories import normalize_category


def test_drinks_bucket_catches_flavoured_milk_and_buttermilk():
    # The bug that motivated this: each landed in a category of one.
    assert normalize_category("flavoured milk") == "drinks"
    assert normalize_category("rose flavoured milk") == "drinks"
    assert normalize_category("buttermilk") == "drinks"
    assert normalize_category("soft drink") == "drinks"
    assert normalize_category("mango juice") == "drinks"


def test_namkeen_bucket():
    assert normalize_category("potato chips") == "namkeen"
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


def test_plain_dairy_vs_beverage_milk():
    assert normalize_category("milk") == "dairy"
    assert normalize_category("paneer") == "dairy"
    # but a milk-based drink is a drink
    assert normalize_category("flavoured milk") == "drinks"


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
    assert normalize_category("", "Rose Flavoured Milk") == "drinks"
    assert normalize_category("", "Dark Chocolate Bar") == "chocolate"


def test_unknown_category_passes_through_lowercased():
    assert normalize_category("Frozen Paratha") == "frozen paratha"
    assert normalize_category("") == ""


def test_empty_when_nothing_known():
    assert normalize_category("", "") == ""


def test_new_phase2_category_buckets():
    from app.categories import normalize_category
    assert normalize_category("", "Amul Vanilla Ice Cream Tub") == "ice cream"
    assert normalize_category("", "Cadbury Bournvita Health Drink") == "health drinks"
    assert normalize_category("", "Horlicks Classic Malt") == "health drinks"
