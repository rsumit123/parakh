from unittest.mock import patch
import pytest
from app.db import make_engine, make_session_factory, init_db
from app.services.auth import AuthService, AuthError


@pytest.fixture
def auth():
    engine = make_engine("sqlite://")
    init_db(engine)
    return AuthService(make_session_factory(engine), secret="test-secret",
                       google_client_id="test-client")


def _info(sub="g-1", email="a@b.com", name="Ada", picture="http://x/a.png"):
    return {"sub": sub, "email": email, "name": name, "picture": picture}


def test_guest_token_roundtrips_to_identity(auth):
    token = auth.guest_token("device-123")
    identity = auth.identify(token)
    assert identity["tier"] == "guest"
    assert identity["id"] == "guest:device-123"


def test_google_login_creates_user_and_token(auth):
    with patch("app.services.auth.google_id_token.verify_oauth2_token",
               return_value=_info()):
        res = auth.login_google("fake")
    assert res["email"] == "a@b.com"
    assert res["name"] == "Ada"
    assert res["avatar_url"] == "http://x/a.png"
    identity = auth.identify(res["token"])
    assert identity["tier"] == "free"
    assert identity["id"].startswith("user:")


def test_google_login_same_sub_is_idempotent(auth):
    with patch("app.services.auth.google_id_token.verify_oauth2_token",
               return_value=_info(sub="g-9")):
        t1 = auth.login_google("fake")["token"]
        t2 = auth.login_google("fake")["token"]
    assert auth.identify(t1)["id"] == auth.identify(t2)["id"]


def test_google_login_links_existing_email_user(auth):
    # Pre-create a user with the same email but no google_id.
    from app.models import User
    with auth._Session() as s:  # noqa: SLF001 - test reaches into the session factory
        s.add(User(email="a@b.com", auth_provider="email", tier="free"))
        s.commit()
    with patch("app.services.auth.google_id_token.verify_oauth2_token",
               return_value=_info(sub="g-link", email="a@b.com")):
        res = auth.login_google("fake")
    # Linked, not duplicated: still exactly one user row.
    from sqlalchemy import select, func
    with auth._Session() as s:
        count = s.scalar(select(func.count()).select_from(User))
    assert count == 1
    assert res["token"]


def test_google_login_invalid_token_raises(auth):
    with patch("app.services.auth.google_id_token.verify_oauth2_token",
               side_effect=ValueError("bad")):
        with pytest.raises(AuthError):
            auth.login_google("bad")


def test_tampered_token_rejected(auth):
    token = auth.guest_token("device-123")
    with pytest.raises(AuthError):
        auth.identify(token + "x")


def test_missing_token_rejected(auth):
    with pytest.raises(AuthError):
        auth.identify("")
