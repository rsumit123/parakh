from app.subtypes import subtype_of


def test_drink_subtypes():
    assert subtype_of("drinks", "Amul Masti Spiced Buttermilk", []) == "dairy"
    assert subtype_of("drinks", "Mango Lassi", ["milk", "mango"]) == "dairy"
    assert subtype_of("drinks", "Coca-Cola Original", []) == "soda"
    assert subtype_of("drinks", "Real Activ Apple Juice", []) == "juice"
    assert subtype_of("drinks", "Sting Energy Drink", []) == "energy"
    assert subtype_of("drinks", "Raw Pressery Coconut Water", []) == "water"
    assert subtype_of("drinks", "Something Generic", []) == ""


def test_non_drink_categories_have_no_subtype():
    assert subtype_of("namkeen", "Haldiram Bhujia", []) == ""
    assert subtype_of("chocolate", "Dairy Milk", ["milk"]) == ""
