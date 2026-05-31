from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    pass


def make_engine(url: str):
    if url in ("sqlite://", "sqlite:///:memory:"):
        return create_engine(
            url, connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    return create_engine(url, connect_args={"check_same_thread": False})


def make_session_factory(engine):
    return sessionmaker(bind=engine, expire_on_commit=False)


def init_db(engine):
    from app import models  # noqa: F401  ensure models are registered
    Base.metadata.create_all(engine)
