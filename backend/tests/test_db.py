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
                      score_json={}, source="db"))
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


def test_migration_adds_category_to_preexisting_products_table():
    # Simulate an OLD on-disk DB whose products table predates the `category` column.
    from sqlalchemy import text
    engine = make_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE products (barcode VARCHAR PRIMARY KEY, name VARCHAR, "
            "brand VARCHAR, ingredients JSON, nutrition JSON, score_overall INTEGER, "
            "score_grade VARCHAR, score_json JSON, source VARCHAR, created_at DATETIME)"
        ))
        conn.execute(text("INSERT INTO products (barcode, name) VALUES ('old', 'Legacy')"))
    # init_db must back-fill the missing column without dropping the existing row.
    init_db(engine)
    from app.repositories.products import ProductRepository
    repo = ProductRepository(make_session_factory(engine))
    p = repo.get("old")
    assert p is not None
    assert p["category"] == ""  # column added with default

    # idempotent: running again is a no-op (no error)
    init_db(engine)


def test_products_table_gets_image_url_on_existing_db():
    from sqlalchemy import text, inspect
    from app.db import make_engine, init_db
    engine = make_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE products (barcode VARCHAR PRIMARY KEY, name VARCHAR, "
            "brand VARCHAR, ingredients JSON, nutrition JSON, score_overall INTEGER, "
            "score_grade VARCHAR, score_json JSON, source VARCHAR, created_at DATETIME)"
        ))
    init_db(engine)
    cols = {c["name"] for c in inspect(engine).get_columns("products")}
    assert "image_url" in cols


def test_users_table_gets_google_columns_on_existing_db():
    # Simulate a pre-existing DB: create the users table WITHOUT the new columns,
    # then run init_db and confirm the lightweight migration adds them.
    from sqlalchemy import text
    from app.db import make_engine, init_db

    engine = make_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE users ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "email VARCHAR, auth_provider VARCHAR, tier VARCHAR, created_at DATETIME)"
        ))
    init_db(engine)
    from sqlalchemy import inspect
    cols = {c["name"] for c in inspect(engine).get_columns("users")}
    assert {"google_id", "display_name", "avatar_url"} <= cols
