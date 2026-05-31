from sqlalchemy import select
from app.db import make_engine, make_session_factory, init_db
from app.models import Product, User, DailyScan


def test_can_create_tables_and_roundtrip_product():
    engine = make_engine("sqlite://")  # in-memory
    init_db(engine)
    Session = make_session_factory(engine)
    with Session() as s:
        s.add(Product(barcode="123", name="Test", brand="B",
                      ingredients=["a"], nutrition={"sugars_g": 1.0},
                      score_overall=80, score_grade="A",
                      score_breakdown={}, source="db"))
        s.commit()
    with Session() as s:
        p = s.scalar(select(Product).where(Product.barcode == "123"))
        assert p.name == "Test"
        assert p.ingredients == ["a"]
        assert p.nutrition["sugars_g"] == 1.0


def test_user_and_dailyscan_tables_exist():
    engine = make_engine("sqlite://")
    init_db(engine)
    Session = make_session_factory(engine)
    with Session() as s:
        s.add(User(email="x@y.com", auth_provider="email", tier="free"))
        s.add(DailyScan(identity="guest:abc", day="2026-05-31", count=2))
        s.commit()
