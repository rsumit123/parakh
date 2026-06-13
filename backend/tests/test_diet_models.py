from app.db import make_engine, make_session_factory, init_db
from app.models import FoodLogEntry, Profile, Product


def _sf():
    e = make_engine("sqlite://")
    init_db(e)
    return make_session_factory(e)


def test_can_persist_food_log_entry():
    sf = _sf()
    with sf() as s:
        s.add(FoodLogEntry(identity="user:1", day="2026-06-13", kind="packaged",
                           name="Amul Lassi", brand="Amul", quantity_g=200.0,
                           energy_kj=260.0, sugars_g=29.0, protein_g=4.2))
        s.commit()
    with sf() as s:
        rows = list(s.query(FoodLogEntry).all())
        assert len(rows) == 1 and rows[0].sugars_g == 29.0 and rows[0].quantity_g == 200.0


def test_can_persist_profile_and_serving_size():
    sf = _sf()
    with sf() as s:
        s.add(Profile(identity="user:1", sex="m", target_overrides={"protein_g": 80}))
        s.add(Product(barcode="x", name="p", serving_size_g=30.0))
        s.commit()
    with sf() as s:
        assert s.get(Profile, "user:1").target_overrides == {"protein_g": 80}
        assert s.get(Product, "x").serving_size_g == 30.0
