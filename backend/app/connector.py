"""Per-user Claude connector URLs: /mcp/<secret>/mcp. The secret in the path is
the credential, because Claude's custom connectors accept only authless or OAuth
servers (no header to carry a token). Only its hash is stored; it decides whose
diary every tool sees.
"""
import contextvars
import hashlib
import secrets
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError

from app.models import ConnectorToken

# Whose diary the current MCP request acts on; set by ConnectorApp per request.
_identity: contextvars.ContextVar[str | None] = contextvars.ContextVar("parakh_mcp_identity", default=None)


def current_identity() -> str:
    ident = _identity.get()
    if not ident:
        raise RuntimeError("no connector identity for this request")
    return ident


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def issue_token(session_factory, identity: str) -> str:
    """A fresh secret for `identity`, replacing any previous one (old URL stops working)."""
    raw = secrets.token_urlsafe(32)
    with session_factory() as s:
        s.execute(delete(ConnectorToken).where(ConnectorToken.identity == identity))
        s.add(ConnectorToken(token_hash=_hash(raw), identity=identity, created_at=datetime.now(timezone.utc)))
        s.commit()
    return raw


def identity_for(session_factory, raw: str | None) -> str | None:
    if not raw:
        return None
    with session_factory() as s:
        return s.scalar(select(ConnectorToken.identity).where(ConnectorToken.token_hash == _hash(raw)))


class ConnectorApp:
    """Mounted at /mcp/{token}: unknown token -> 404; known -> run the MCP app as its owner."""

    def __init__(self, inner, session_factory):
        self.inner = inner
        self.session_factory = session_factory

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.inner(scope, receive, send)
        try:
            ident = identity_for(self.session_factory, (scope.get("path_params") or {}).get("token"))
        except SQLAlchemyError:
            return await _plain(send, 503, b"Service temporarily unavailable")
        if ident is None:
            return await _plain(send, 404, b"Not Found")
        if scope.get("method") == "GET":
            # stateless server: no SSE stream to offer; the spec allows saying so with 405
            return await _plain(send, 405, b"Method Not Allowed", [(b"allow", b"POST")])
        token = _identity.set(ident)
        try:
            await self.inner(scope, receive, send)
        finally:
            _identity.reset(token)


async def _plain(send, status: int, body: bytes, extra=()):
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", b"text/plain"), *extra]})
    await send({"type": "http.response.body", "body": body})
