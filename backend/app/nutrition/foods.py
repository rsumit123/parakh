"""Reference nutrition for common Indian home and street foods.

The meal estimator's vision model only *identifies* foods and portions; nutrition
comes from this table, so the same dish always gets the same numbers (the model's
own per-100 g guesses were inconsistent, e.g. cooked rice at 358 kcal/100 g).

Values are per 100 g of the food as eaten (cooked), approximated from the Indian
Food Composition Tables (ICMR-NIN, IFCT 2017) and standard recipe calculations for
typical home cooking. Columns:
    kcal, protein, carbs, fat, fibre, sugars, sat_fat, salt   (g, except kcal)
plus portion data:
    unit_g    weight of one piece for countable foods (roti, egg, almond...), else None
    default_g a typical single serving when nothing better is known
    min_g, max_g  sane bounds for one serving, used to clamp the model's grams
"""
from typing import NamedTuple


class Food(NamedTuple):
    name: str
    kcal: float
    protein: float
    carbs: float
    fat: float
    fibre: float
    sugars: float
    sat_fat: float
    salt: float
    unit_g: float | None
    default_g: float
    min_g: float
    max_g: float


def _f(name, kcal, p, c, f, fib, sug, sat, salt, unit=None, default=200, lo=20, hi=600):
    return Food(name, kcal, p, c, f, fib, sug, sat, salt, unit, default, lo, hi)


FOODS: dict[str, Food] = {
    # --- breads (countable) ---
    "roti":            _f("Roti", 264, 9.0, 46.0, 4.0, 7.0, 1.5, 0.7, 0.4, unit=40, default=80),
    "bajra_roti":      _f("Bajra Roti", 290, 8.5, 50.0, 4.0, 8.0, 1.0, 0.8, 0.3, unit=55, default=110),
    "jowar_roti":      _f("Jowar Roti", 280, 8.0, 52.0, 3.0, 7.0, 1.0, 0.5, 0.3, unit=50, default=100),
    "makki_roti":      _f("Makki Roti", 300, 7.0, 50.0, 8.0, 6.0, 1.0, 2.0, 0.4, unit=60, default=120),
    "missi_roti":      _f("Missi Roti", 285, 11.0, 44.0, 7.0, 7.5, 1.5, 1.5, 0.6, unit=50, default=100),
    "paratha":         _f("Paratha", 326, 7.5, 45.0, 13.0, 5.5, 1.5, 4.5, 0.6, unit=60, default=120),
    "aloo_paratha":    _f("Aloo Paratha", 260, 6.0, 37.0, 10.0, 4.0, 1.5, 3.5, 0.7, unit=110, default=110),
    "puri":            _f("Puri", 360, 7.0, 45.0, 17.0, 4.0, 1.0, 3.0, 0.5, unit=25, default=75),
    "naan":            _f("Naan", 290, 9.0, 50.0, 5.5, 2.5, 3.0, 1.5, 1.0, unit=90, default=90),
    "bread_slice":     _f("Bread", 265, 9.0, 49.0, 3.2, 2.7, 5.0, 0.7, 1.2, unit=28, default=56),
    # --- rice & grains ---
    "rice":            _f("Rice", 130, 2.7, 28.0, 0.3, 0.4, 0.1, 0.1, 0.0, default=200, lo=50, hi=500),
    "jeera_rice":      _f("Jeera Rice", 160, 3.0, 29.0, 3.5, 0.6, 0.1, 1.5, 0.4, default=200, lo=50, hi=500),
    "veg_pulao":       _f("Veg Pulao", 160, 3.5, 26.0, 4.5, 1.5, 1.0, 1.5, 0.6, default=250, lo=80, hi=500),
    "veg_biryani":     _f("Veg Biryani", 170, 4.0, 27.0, 5.0, 2.0, 1.5, 2.0, 0.8, default=300, lo=100, hi=600),
    "chicken_biryani": _f("Chicken Biryani", 190, 9.0, 23.0, 7.0, 1.0, 1.0, 2.5, 0.9, default=300, lo=100, hi=600),
    "khichdi":         _f("Khichdi", 125, 4.5, 21.0, 2.5, 2.0, 0.5, 1.0, 0.5, default=250, lo=80, hi=500),
    "curd_rice":       _f("Curd Rice", 130, 3.5, 21.0, 3.5, 0.5, 2.0, 2.0, 0.5, default=250, lo=80, hi=500),
    "lemon_rice":      _f("Lemon Rice", 170, 3.0, 28.0, 5.0, 1.0, 0.5, 0.8, 0.6, default=200, lo=80, hi=450),
    "poha":            _f("Poha", 160, 3.0, 27.0, 4.5, 1.5, 1.5, 0.6, 0.6, default=200, lo=80, hi=400),
    "upma":            _f("Upma", 150, 3.5, 22.0, 5.0, 1.5, 1.0, 1.0, 0.7, default=200, lo=80, hi=400),
    "oats_porridge":   _f("Oats", 90, 3.5, 14.0, 2.5, 2.0, 4.0, 1.2, 0.1, default=250, lo=100, hi=450),
    # --- dals & legumes (bowls) ---
    "dal_tadka":       _f("Dal Tadka", 120, 6.0, 15.0, 3.5, 3.5, 1.0, 1.5, 0.6, default=200, lo=60, hi=450),
    "chana_dal":       _f("Chana Dal", 150, 8.0, 20.0, 4.0, 5.0, 1.5, 1.5, 0.6, default=200, lo=60, hi=450),
    "moong_dal":       _f("Moong Dal", 105, 6.5, 14.0, 2.5, 3.0, 1.0, 1.0, 0.5, default=200, lo=60, hi=450),
    "dal_makhani":     _f("Dal Makhani", 150, 6.5, 14.0, 7.5, 4.0, 1.5, 4.5, 0.8, default=200, lo=60, hi=450),
    "rajma":           _f("Rajma", 140, 7.0, 18.0, 4.5, 6.0, 2.0, 0.8, 0.7, default=200, lo=60, hi=450),
    "chole":           _f("Chole", 160, 7.5, 20.0, 5.5, 6.0, 2.5, 0.8, 0.8, default=200, lo=60, hi=450),
    "sambar":          _f("Sambar", 80, 3.5, 11.0, 2.5, 3.0, 2.0, 0.4, 0.7, default=200, lo=60, hi=450),
    "kadhi":           _f("Kadhi", 90, 3.5, 8.0, 5.0, 0.8, 3.0, 2.5, 0.7, default=200, lo=60, hi=450),
    "sprouts_salad":   _f("Sprouts", 100, 7.0, 15.0, 1.0, 4.0, 2.0, 0.2, 0.3, default=100, lo=30, hi=250),
    # --- vegetable sabzis ---
    "aloo_sabzi":      _f("Aloo Sabzi", 100, 2.5, 11.0, 5.0, 3.0, 3.0, 0.8, 0.7, default=120, lo=30, hi=350),
    "aloo_gobi":       _f("Aloo Gobi", 95, 2.5, 10.0, 5.0, 3.0, 2.5, 0.8, 0.7, default=120, lo=30, hi=350),
    "mixed_veg_sabzi": _f("Mixed Veg Sabzi", 100, 2.5, 11.0, 5.0, 3.0, 3.0, 0.8, 0.7, default=120, lo=30, hi=350),
    "lauki_sabzi":     _f("Lauki Sabzi", 70, 1.5, 7.0, 4.0, 2.5, 3.0, 0.6, 0.6, default=120, lo=30, hi=350),
    "bhindi_sabzi":    _f("Bhindi Sabzi", 110, 2.5, 9.0, 7.0, 4.0, 2.5, 1.0, 0.6, default=120, lo=30, hi=350),
    "baingan_chokha":  _f("Baingan Chokha", 80, 1.5, 8.0, 5.0, 3.0, 4.0, 0.6, 0.6, default=100, lo=30, hi=300),
    "baingan_bharta":  _f("Baingan Bharta", 100, 2.0, 9.0, 6.5, 3.5, 4.0, 1.0, 0.7, default=120, lo=30, hi=300),
    "aloo_chokha":     _f("Aloo Chokha", 120, 2.0, 18.0, 4.5, 2.0, 1.0, 0.6, 0.6, default=100, lo=30, hi=300),
    "palak_sabzi":     _f("Palak Sabzi", 70, 3.0, 5.0, 4.5, 2.5, 1.0, 0.7, 0.6, default=120, lo=30, hi=300),
    "cabbage_sabzi":   _f("Cabbage Sabzi", 75, 1.5, 7.0, 4.5, 2.5, 3.5, 0.6, 0.6, default=120, lo=30, hi=300),
    "beans_sabzi":     _f("Beans Sabzi", 80, 2.0, 7.0, 5.0, 3.5, 2.5, 0.7, 0.6, default=120, lo=30, hi=300),
    "soya_chunks_curry": _f("Soya Chunks", 150, 12.0, 9.0, 7.0, 4.0, 1.5, 1.0, 0.8, default=100, lo=30, hi=300),
    # --- paneer & fresh cheese ---
    "paneer_sabzi":    _f("Paneer Sabzi", 280, 15.0, 5.0, 22.0, 0.8, 2.0, 13.0, 1.0, default=100, lo=30, hi=300),
    "palak_paneer":    _f("Palak Paneer", 200, 10.0, 6.0, 15.0, 1.5, 2.0, 8.0, 0.9, default=150, lo=40, hi=350),
    "paneer_butter_masala": _f("Paneer Butter Masala", 250, 9.0, 9.0, 20.0, 1.0, 4.0, 11.0, 1.0, default=150, lo=40, hi=350),
    "paneer_bhurji":   _f("Paneer Bhurji", 260, 14.0, 6.0, 20.0, 1.0, 2.5, 11.0, 1.0, default=100, lo=30, hi=300),
    "paneer_tikka":    _f("Paneer Tikka", 260, 16.0, 6.0, 19.0, 1.0, 2.0, 10.0, 1.0, default=120, lo=30, hi=300),
    "chhena":          _f("Chhena", 200, 13.0, 4.0, 14.0, 0.0, 3.0, 9.0, 0.1, default=100, lo=30, hi=250),
    # --- eggs & non-veg ---
    "boiled_egg":      _f("Boiled Egg", 155, 12.6, 1.1, 10.6, 0.0, 1.1, 3.3, 0.31, unit=50, default=100),
    "omelette":        _f("Omelette", 180, 11.0, 2.0, 14.0, 0.3, 1.0, 4.0, 0.8, unit=60, default=120),
    "egg_curry":       _f("Egg Curry", 150, 8.0, 5.0, 11.0, 1.0, 2.0, 3.0, 0.9, default=200, lo=60, hi=400),
    "egg_bhurji":      _f("Egg Bhurji", 190, 11.0, 4.0, 14.5, 0.8, 2.0, 4.0, 0.8, default=120, lo=40, hi=300),
    "chicken_curry":   _f("Chicken Curry", 160, 14.0, 4.0, 10.0, 1.0, 2.0, 3.0, 0.9, default=200, lo=60, hi=450),
    "butter_chicken":  _f("Butter Chicken", 220, 13.0, 6.0, 16.0, 1.0, 4.0, 8.0, 1.0, default=200, lo=60, hi=450),
    "tandoori_chicken": _f("Tandoori Chicken", 180, 25.0, 3.0, 7.5, 0.5, 1.5, 2.0, 1.0, default=200, lo=60, hi=450),
    "mutton_curry":    _f("Mutton Curry", 200, 15.0, 4.0, 14.0, 1.0, 2.0, 5.5, 0.9, default=200, lo=60, hi=450),
    "fish_curry":      _f("Fish Curry", 130, 13.0, 4.0, 7.0, 0.8, 1.5, 1.5, 0.9, default=200, lo=60, hi=450),
    # --- dairy & drinks ---
    "curd":            _f("Curd", 60, 3.1, 4.7, 3.3, 0.0, 4.7, 2.1, 0.1, default=150, lo=40, hi=400),
    "raita":           _f("Raita", 55, 2.8, 5.0, 2.8, 0.5, 4.0, 1.8, 0.4, default=120, lo=40, hi=300),
    "milk":            _f("Milk", 62, 3.2, 4.8, 3.4, 0.0, 4.8, 2.2, 0.1, default=250, lo=100, hi=500),
    "chaas":           _f("Chaas", 20, 1.2, 2.0, 0.8, 0.0, 2.0, 0.5, 0.4, default=250, lo=100, hi=500),
    "sweet_lassi":     _f("Sweet Lassi", 100, 3.0, 15.0, 3.0, 0.0, 14.0, 2.0, 0.1, default=250, lo=100, hi=500),
    "masala_chai":     _f("Masala Chai", 50, 1.5, 7.5, 1.5, 0.0, 7.0, 1.0, 0.05, default=150, lo=50, hi=300),
    "coffee_milk":     _f("Coffee", 55, 2.0, 7.0, 2.0, 0.0, 7.0, 1.3, 0.05, default=150, lo=50, hi=300),
    # --- south Indian ---
    "idli":            _f("Idli", 130, 4.0, 27.0, 0.5, 1.5, 0.5, 0.1, 0.6, unit=40, default=120),
    "plain_dosa":      _f("Dosa", 180, 4.0, 28.0, 6.0, 1.5, 0.5, 1.0, 0.7, unit=80, default=80),
    "masala_dosa":     _f("Masala Dosa", 170, 3.5, 25.0, 6.5, 2.0, 1.0, 1.5, 0.7, unit=180, default=180),
    "medu_vada":       _f("Medu Vada", 300, 9.0, 28.0, 17.0, 4.0, 1.0, 2.5, 0.8, unit=50, default=100),
    "uttapam":         _f("Uttapam", 170, 4.5, 27.0, 5.0, 2.0, 1.5, 0.8, 0.7, unit=120, default=120),
    "coconut_chutney": _f("Coconut Chutney", 180, 2.5, 7.0, 16.0, 4.5, 2.5, 13.0, 0.8, default=40, lo=10, hi=120),
    # --- snacks ---
    "samosa":          _f("Samosa", 310, 5.0, 33.0, 17.0, 3.0, 2.0, 4.0, 0.8, unit=70, default=70),
    "pakora":          _f("Pakora", 300, 7.0, 25.0, 19.0, 4.0, 2.0, 3.0, 0.9, unit=20, default=80),
    "kachori":         _f("Kachori", 400, 8.0, 40.0, 23.0, 4.0, 2.0, 6.0, 1.0, unit=60, default=60),
    "dhokla":          _f("Dhokla", 160, 6.0, 22.0, 5.0, 2.0, 5.0, 0.7, 1.0, unit=35, default=105),
    "vada_pav":        _f("Vada Pav", 290, 7.0, 40.0, 11.0, 3.0, 4.0, 2.5, 1.2, unit=150, default=150),
    "pav_bhaji":       _f("Pav Bhaji", 200, 5.0, 28.0, 8.0, 4.0, 5.0, 3.5, 1.2, default=300, lo=100, hi=500),
    "chaat":           _f("Chaat", 220, 5.0, 30.0, 9.0, 4.0, 8.0, 1.5, 1.2, default=150, lo=60, hi=350),
    "namkeen":         _f("Namkeen", 520, 12.0, 45.0, 33.0, 6.0, 3.0, 8.0, 2.0, default=30, lo=10, hi=150),
    "biscuits":        _f("Biscuits", 470, 7.0, 70.0, 18.0, 2.0, 22.0, 9.0, 0.8, unit=8, default=24),
    "maggi_noodles":   _f("Instant Noodles", 140, 3.0, 19.0, 6.0, 1.0, 1.0, 2.8, 1.3, default=250, lo=100, hi=450),
    # --- sweets ---
    "gulab_jamun":     _f("Gulab Jamun", 320, 5.0, 50.0, 12.0, 0.5, 40.0, 6.0, 0.2, unit=40, default=80),
    "rasgulla":        _f("Rasgulla", 190, 5.0, 40.0, 1.5, 0.0, 37.0, 1.0, 0.1, unit=40, default=80),
    "jalebi":          _f("Jalebi", 400, 3.0, 65.0, 15.0, 0.5, 50.0, 3.0, 0.1, unit=25, default=75),
    "barfi":           _f("Barfi", 420, 9.0, 55.0, 18.0, 0.5, 48.0, 11.0, 0.2, unit=25, default=50),
    "ladoo":           _f("Ladoo", 450, 7.0, 55.0, 22.0, 2.0, 35.0, 10.0, 0.1, unit=35, default=35),
    "halwa":           _f("Halwa", 330, 4.0, 45.0, 15.0, 1.5, 30.0, 8.0, 0.1, default=100, lo=30, hi=250),
    "kheer":           _f("Kheer", 160, 4.5, 24.0, 5.0, 0.3, 17.0, 3.2, 0.1, default=150, lo=50, hi=300),
    "jaggery":         _f("Jaggery", 380, 0.4, 95.0, 0.1, 0.0, 85.0, 0.0, 0.1, default=10, lo=3, hi=50),
    # --- fruit (countable where it makes sense) ---
    "banana":          _f("Banana", 89, 1.1, 23.0, 0.3, 2.6, 12.0, 0.1, 0.0, unit=100, default=100),
    "apple":           _f("Apple", 52, 0.3, 14.0, 0.2, 2.4, 10.0, 0.0, 0.0, unit=170, default=170),
    "orange":          _f("Orange", 47, 0.9, 12.0, 0.1, 2.4, 9.0, 0.0, 0.0, unit=130, default=130),
    "papaya":          _f("Papaya", 43, 0.5, 11.0, 0.3, 1.7, 8.0, 0.1, 0.0, default=150, lo=50, hi=400),
    "mango":           _f("Mango", 60, 0.8, 15.0, 0.4, 1.6, 14.0, 0.1, 0.0, default=150, lo=50, hi=400),
    "guava":           _f("Guava", 68, 2.6, 14.0, 1.0, 5.4, 9.0, 0.3, 0.0, unit=150, default=150),
    "pomegranate":     _f("Pomegranate", 83, 1.7, 19.0, 1.2, 4.0, 14.0, 0.1, 0.0, default=100, lo=30, hi=300),
    "grapes":          _f("Grapes", 69, 0.7, 18.0, 0.2, 0.9, 16.0, 0.1, 0.0, default=100, lo=30, hi=300),
    "watermelon":      _f("Watermelon", 30, 0.6, 8.0, 0.2, 0.4, 6.0, 0.0, 0.0, default=250, lo=100, hi=600),
    # --- nuts & dry fruits (countable by piece) ---
    "almonds":         _f("Almonds", 579, 21.0, 22.0, 50.0, 12.5, 4.4, 3.8, 0.0, unit=1.2, default=10, lo=1, hi=80),
    "cashews":         _f("Cashews", 553, 18.0, 30.0, 44.0, 3.3, 6.0, 7.8, 0.0, unit=1.5, default=10, lo=1, hi=80),
    "walnuts":         _f("Walnuts", 654, 15.0, 14.0, 65.0, 6.7, 2.6, 6.1, 0.0, unit=3.5, default=10, lo=1, hi=80),
    "raisins":         _f("Raisins", 299, 3.1, 79.0, 0.5, 3.7, 59.0, 0.1, 0.0, unit=0.5, default=5, lo=0.5, hi=60),
    "dates":           _f("Dates", 282, 2.5, 75.0, 0.4, 8.0, 63.0, 0.0, 0.0, unit=8, default=16, lo=4, hi=80),
    "peanuts":         _f("Peanuts", 567, 26.0, 16.0, 49.0, 8.5, 4.7, 6.8, 0.0, default=25, lo=5, hi=100),
    "makhana":         _f("Makhana", 350, 9.7, 77.0, 0.1, 14.5, 0.0, 0.0, 0.0, default=20, lo=5, hi=80),
    "mixed_dry_fruits": _f("Mixed Dry Fruits", 573, 16.1, 26.7, 49.3, 6.9, 9.4, 5.5, 0.0, default=25, lo=5, hi=100),
    # --- sides ---
    "raw_onion":       _f("Onion", 40, 1.1, 9.3, 0.1, 1.7, 4.2, 0.0, 0.0, default=30, lo=5, hi=100),
    "green_salad":     _f("Salad", 25, 1.0, 5.0, 0.2, 2.0, 2.5, 0.0, 0.0, default=80, lo=20, hi=250),
    "pickle":          _f("Pickle", 200, 1.5, 6.0, 19.0, 2.0, 1.0, 2.5, 6.0, default=10, lo=3, hi=40),
    "papad":           _f("Papad", 370, 25.0, 60.0, 3.0, 9.0, 1.0, 0.5, 4.5, unit=12, default=12, lo=5, hi=60),
    "green_chutney":   _f("Green Chutney", 60, 2.0, 7.0, 3.0, 3.0, 2.0, 0.4, 1.2, default=20, lo=5, hi=60),
    "ghee":            _f("Ghee", 900, 0.0, 0.0, 100.0, 0.0, 0.0, 62.0, 0.0, default=5, lo=1, hi=30),
}

MACRO_FROM_FOOD = (("energy_kj", "kcal"), ("protein_g", "protein"), ("carbs_g", "carbs"),
                   ("fat_g", "fat"), ("fibre_g", "fibre"), ("sugars_g", "sugars"),
                   ("sat_fat_g", "sat_fat"), ("salt_g", "salt"))


def per100g(food: Food) -> dict:
    """Food nutrition in the app's per-100 g macro keys (energy in kJ)."""
    out = {}
    for key, attr in MACRO_FROM_FOOD:
        v = getattr(food, attr)
        out[key] = round(v * 4.184, 1) if key == "energy_kj" else v
    return out


# Other names people search by (Hindi / regional / English), for the app's food search.
ALIASES: dict[str, tuple[str, ...]] = {
    "roti": ("chapati", "chapathi", "phulka", "fulka"),
    "paratha": ("parantha",), "aloo_paratha": ("potato paratha",),
    "rice": ("chawal", "plain rice", "steamed rice"),
    "dal_tadka": ("dal", "daal", "arhar dal", "toor dal", "dal fry"),
    "moong_dal": ("moong daal",), "chana_dal": ("chana daal",),
    "rajma": ("kidney beans",), "chole": ("chana", "chickpeas", "chhole"),
    "sprouts_salad": ("moong sprouts",), "soya_chunks_curry": ("soya", "nutrela"),
    "aloo_sabzi": ("potato",), "aloo_gobi": ("cauliflower", "gobi"), "aloo_chokha": ("mashed potato",),
    "bhindi_sabzi": ("okra", "lady finger", "bhindi"), "lauki_sabzi": ("bottle gourd", "lauki", "ghiya"),
    "baingan_bharta": ("brinjal", "eggplant"), "baingan_chokha": ("brinjal",),
    "palak_sabzi": ("spinach",), "cabbage_sabzi": ("patta gobi",), "beans_sabzi": ("french beans",),
    "paneer_sabzi": ("cottage cheese",), "chhena": ("chenna",),
    "boiled_egg": ("egg", "anda", "eggs"), "omelette": ("omelet", "egg"), "egg_bhurji": ("scrambled egg",),
    "curd": ("dahi", "yogurt", "yoghurt"), "chaas": ("buttermilk", "mattha"),
    "sweet_lassi": ("lassi",), "masala_chai": ("chai", "tea"), "coffee_milk": ("coffee",),
    "plain_dosa": ("dosai",), "medu_vada": ("vada",), "maggi_noodles": ("maggi", "noodles"),
    "oats_porridge": ("oatmeal", "porridge"), "poha": ("aval", "chivda"),
    "peanuts": ("groundnut", "moongphali"), "makhana": ("fox nut", "lotus seed"),
    "jaggery": ("gur",), "mixed_dry_fruits": ("dry fruits", "nuts"), "raw_onion": ("pyaz",),
    "green_salad": ("cucumber", "kheera"), "watermelon": ("tarbooz",), "guava": ("amrood",),
}


def catalog() -> list[dict]:
    """Every food for the app's search and portion picker, in table order."""
    return [{"id": fid, "name": f.name, "aliases": list(ALIASES.get(fid, ())),
             "unit_g": f.unit_g, "default_g": f.default_g, "min_g": f.min_g, "max_g": f.max_g,
             "per100g": per100g(f)} for fid, f in FOODS.items()]


def menu() -> str:
    """Compact id list for the model prompt: `id (unit 40g)` for countables."""
    return ", ".join(f"{fid}{f' (per piece)' if f.unit_g else ''}" for fid, f in FOODS.items())
