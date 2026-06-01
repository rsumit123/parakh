import hashlib
import hmac
from sqlalchemy import select
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from app.models import User


class AuthError(Exception):
    """Raised when a token is missing, malformed, or fails signature/verification."""


def _sign(payload: str, secret: str) -> str:
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


class AuthService:
    """Issues and validates opaque signed tokens.
    Token format: '<payload>.<hexsig>' where payload is 'guest:<device>' or 'user:<id>'."""

    def __init__(self, session_factory, secret: str, google_client_id: str = ""):
        self._Session = session_factory
        self._secret = secret
        self._google_client_id = google_client_id

    def _make_token(self, payload: str) -> str:
        return f"{payload}.{_sign(payload, self._secret)}"

    def guest_token(self, device_id: str) -> str:
        if not device_id:
            raise AuthError("device id required")
        return self._make_token(f"guest:{device_id}")

    def login_google(self, id_token_str: str) -> dict:
        """Verify a Google ID token, create-or-link a User, and issue a 'user:<id>'
        token. Returns {token, email, name, avatar_url}."""
        try:
            info = google_id_token.verify_oauth2_token(
                id_token_str, google_requests.Request(), self._google_client_id
            )
        except Exception as exc:  # google raises ValueError on bad/expired tokens
            raise AuthError("invalid google token") from exc

        google_id = info["sub"]
        email = info.get("email", "")
        name = info.get("name")
        picture = info.get("picture")

        with self._Session() as s:
            user = s.scalar(select(User).where(User.google_id == google_id))
            if user is None and email:
                user = s.scalar(select(User).where(User.email == email))
                if user is not None:
                    user.google_id = google_id  # link existing email account
            if user is None:
                user = User(email=email, google_id=google_id, display_name=name,
                            avatar_url=picture, auth_provider="google", tier="free")
                s.add(user)
            else:
                # keep profile fresh on repeat logins
                user.display_name = name
                user.avatar_url = picture
            s.commit()
            return {
                "token": self._make_token(f"user:{user.id}"),
                "email": user.email,
                "name": user.display_name,
                "avatar_url": user.avatar_url,
            }

    def identify(self, token: str) -> dict:
        if not token or "." not in token:
            raise AuthError("malformed token")
        payload, sig = token.rsplit(".", 1)
        if not hmac.compare_digest(sig, _sign(payload, self._secret)):
            raise AuthError("bad signature")
        tier = "guest" if payload.startswith("guest:") else "free"
        return {"id": payload, "tier": tier}
