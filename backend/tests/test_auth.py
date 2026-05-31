import pytest
from app.db import make_engine, make_session_factory, init_db
from app.services.auth import AuthService, AuthError


@pytest.fixture
def auth():
    engine = make_engine("sqlite://")
    init_db(engine)
    return AuthService(make_session_factory(engine), secret="test-secret")


def test_guest_token_roundtrips_to_identity(auth):
    token = auth.guest_token("device-123")
    identity = auth.identify(token)
    assert identity["tier"] == "guest"
    assert identity["id"] == "guest:device-123"


def test_email_login_creates_user_and_token(auth):
    token = auth.login_email("a@b.com")
    identity = auth.identify(token)
    assert identity["tier"] == "free"
    assert identity["id"].startswith("user:")


def test_email_login_is_idempotent_same_user(auth):
    t1 = auth.login_email("a@b.com")
    t2 = auth.login_email("a@b.com")
    assert auth.identify(t1)["id"] == auth.identify(t2)["id"]


def test_tampered_token_rejected(auth):
    token = auth.guest_token("device-123")
    with pytest.raises(AuthError):
        auth.identify(token + "x")


def test_missing_token_rejected(auth):
    with pytest.raises(AuthError):
        auth.identify("")
