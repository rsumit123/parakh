import hashlib
import hmac
from sqlalchemy import select
from app.models import User


class AuthError(Exception):
    """Raised when a token is missing, malformed, or fails signature check."""


def _sign(payload: str, secret: str) -> str:
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


class AuthService:
    """Issues and validates opaque signed tokens.
    Token format: '<payload>.<hexsig>' where payload is 'guest:<device>' or 'user:<id>'."""

    def __init__(self, session_factory, secret: str):
        self._Session = session_factory
        self._secret = secret

    def _make_token(self, payload: str) -> str:
        return f"{payload}.{_sign(payload, self._secret)}"

    def guest_token(self, device_id: str) -> str:
        if not device_id:
            raise AuthError("device id required")
        return self._make_token(f"guest:{device_id}")

    def login_email(self, email: str) -> str:
        if not email or "@" not in email:
            raise AuthError("valid email required")
        with self._Session() as s:
            user = s.scalar(select(User).where(User.email == email))
            if user is None:
                user = User(email=email, auth_provider="email", tier="free")
                s.add(user)
                s.commit()
            return self._make_token(f"user:{user.id}")

    def identify(self, token: str) -> dict:
        if not token or "." not in token:
            raise AuthError("malformed token")
        payload, sig = token.rsplit(".", 1)
        if not hmac.compare_digest(sig, _sign(payload, self._secret)):
            raise AuthError("bad signature")
        tier = "guest" if payload.startswith("guest:") else "free"
        return {"id": payload, "tier": tier}
