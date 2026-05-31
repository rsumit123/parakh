import pytest
from app.db import make_engine, make_session_factory, init_db
from app.services.rate_limiter import RateLimiter


@pytest.fixture
def limiter():
    engine = make_engine("sqlite://")
    init_db(engine)
    return RateLimiter(make_session_factory(engine), guest_limit=3, free_limit=10)


def test_guest_allowed_until_limit(limiter):
    for expected_remaining in (2, 1, 0):
        res = limiter.check_and_consume("guest:abc", "guest", day="2026-05-31")
        assert res["allowed"] is True
        assert res["remaining"] == expected_remaining
    blocked = limiter.check_and_consume("guest:abc", "guest", day="2026-05-31")
    assert blocked["allowed"] is False
    assert blocked["remaining"] == 0


def test_free_has_higher_limit(limiter):
    res = None
    for _ in range(10):
        res = limiter.check_and_consume("user:1", "free", day="2026-05-31")
    assert res["allowed"] is True
    assert limiter.check_and_consume("user:1", "free", day="2026-05-31")["allowed"] is False


def test_limit_resets_next_day(limiter):
    for _ in range(3):
        limiter.check_and_consume("guest:abc", "guest", day="2026-05-31")
    assert limiter.check_and_consume("guest:abc", "guest", day="2026-05-31")["allowed"] is False
    nextday = limiter.check_and_consume("guest:abc", "guest", day="2026-06-01")
    assert nextday["allowed"] is True
    assert nextday["remaining"] == 2
