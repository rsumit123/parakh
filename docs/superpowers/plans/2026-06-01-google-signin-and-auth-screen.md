# Google Sign-In + Sign-In Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unverified email login with real Google Sign-In (keeping guest access) and redesign the pre-sign-in landing screen.

**Architecture:** Frontend uses Google Identity Services (GIS) to obtain an ID-token credential, POSTs it to a new `POST /auth/google`; the backend verifies it with the `google-auth` library and issues the **existing** opaque `user:<id>` token, so rate-limiting and scan-counting are untouched. The email login path is removed end-to-end. The landing screen is rebuilt to the approved "C refined" dark mockup.

**Tech Stack:** FastAPI + SQLAlchemy 2.x + SQLite (backend, `backend/.venv`, pytest); React 18 + TypeScript + Vite + Vitest (frontend). `google-auth>=2.27.0` (new backend dep). Google Identity Services script (frontend).

**Spec:** `docs/superpowers/specs/2026-06-01-google-signin-and-auth-screen-design.md`

---

## File Structure

**Backend (modify):**
- `backend/pyproject.toml` — add `google-auth>=2.27.0` dependency.
- `backend/Dockerfile` — add `google-auth` to the explicit `pip install` layer.
- `backend/app/config.py` — add `google_client_id` setting.
- `backend/app/models.py` — add `google_id`, `display_name`, `avatar_url` to `User`.
- `backend/app/db.py` — add `users` columns to `_ADDED_COLUMNS`.
- `backend/app/services/auth.py` — add `login_google`, remove `login_email`, accept `google_client_id`.
- `backend/app/schemas.py` — add `GoogleLoginRequest`/`GoogleLoginResponse`, remove `EmailLoginRequest`.
- `backend/app/main.py` — add `POST /auth/google`, remove `POST /auth/login`, wire `google_client_id`.
- `backend/tests/test_auth.py` — replace email tests with Google tests.
- `backend/tests/test_api.py` — add a Google-login API test.
- `backend/tests/test_db.py` — add a migration test for the new columns.

**Frontend (modify):**
- `frontend/index.html` — add the GIS `<script>`.
- `frontend/src/session/session.ts` — add `googleLogin`, remove `emailLogin`.
- `frontend/src/session/SessionContext.tsx` — add `loginGoogle`, remove `login`.
- `frontend/src/App.tsx` — pass `onGoogleLogin` to `AuthScreen`.
- `frontend/src/screens/AuthScreen.tsx` — rebuild UI + wire GIS button.
- `frontend/src/screens/AuthScreen.module.css` — rebuild styles to the "C refined" mockup.
- `frontend/src/session/session.test.ts` — replace email test with Google test.
- `frontend/src/screens/AuthScreen.test.tsx` — rewrite for the new UI.
- `frontend/.env.local.example` — document `VITE_GOOGLE_CLIENT_ID` (create).

**Conventions:** Run backend tests from `backend/` with `.venv/bin/pytest`. Run frontend tests from `frontend/` with `npm test`, build with `npm run build`.

---

## Task 1: Add the google-auth dependency

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/Dockerfile`
- Install: into `backend/.venv`

- [ ] **Step 1: Add the dependency to `pyproject.toml`**

In `backend/pyproject.toml`, the `dependencies` list currently ends with `"python-multipart>=0.0.9",`. Add a line so it reads:

```toml
dependencies = [
  "fastapi>=0.110",
  "uvicorn[standard]>=0.29",
  "sqlalchemy>=2.0",
  "httpx>=0.27",
  "pydantic>=2.6",
  "pydantic-settings>=2.2",
  "python-multipart>=0.0.9",
  "google-auth>=2.27.0",
]
```

- [ ] **Step 2: Add the dependency to the Dockerfile**

In `backend/Dockerfile`, the `RUN pip install` block ends with `    "python-multipart>=0.0.9"`. Change it to add google-auth (note the trailing `\` on the previous line):

```dockerfile
RUN pip install --no-cache-dir \
    "fastapi>=0.110" \
    "uvicorn[standard]>=0.29" \
    "sqlalchemy>=2.0" \
    "httpx>=0.27" \
    "pydantic>=2.6" \
    "pydantic-settings>=2.2" \
    "python-multipart>=0.0.9" \
    "google-auth>=2.27.0"
```

- [ ] **Step 3: Install into the local venv**

Run (from `backend/`): `.venv/bin/pip install "google-auth>=2.27.0"`
Expected: ends with `Successfully installed google-auth-2.x.x ...` (plus its deps `cachetools`, `pyasn1-modules`, `rsa`).

- [ ] **Step 4: Verify the import works**

Run (from `backend/`): `.venv/bin/python -c "from google.oauth2 import id_token; from google.auth.transport import requests; print('ok')"`
Expected: prints `ok`

- [ ] **Step 5: Commit**

```bash
git add backend/pyproject.toml backend/Dockerfile
git commit -m "build: add google-auth dependency for Google Sign-In"
```

---

## Task 2: Add Google identity columns to the User model

**Files:**
- Modify: `backend/app/models.py:26-32`
- Modify: `backend/app/db.py:13-15`
- Test: `backend/tests/test_db.py`

- [ ] **Step 1: Write the failing migration test**

Add to the end of `backend/tests/test_db.py`:

```python
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
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `.venv/bin/pytest tests/test_db.py::test_users_table_gets_google_columns_on_existing_db -v`
Expected: FAIL — the new columns are missing from `users`.

- [ ] **Step 3: Add the columns to the `User` model**

In `backend/app/models.py`, replace the `User` class body (lines 26-32) with:

```python
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String, unique=True)
    auth_provider: Mapped[str] = mapped_column(String, default="email")
    tier: Mapped[str] = mapped_column(String, default="free")  # guest|free|paid
    google_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
```

- [ ] **Step 4: Add the lightweight migration for existing DBs**

In `backend/app/db.py`, replace the `_ADDED_COLUMNS` block (lines 13-15) with:

```python
_ADDED_COLUMNS: dict[str, dict[str, str]] = {
    "products": {"category": "VARCHAR DEFAULT ''"},
    "users": {
        "google_id": "VARCHAR",
        "display_name": "VARCHAR",
        "avatar_url": "VARCHAR",
    },
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `backend/`): `.venv/bin/pytest tests/test_db.py -v`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/app/db.py backend/tests/test_db.py
git commit -m "feat: add google_id/display_name/avatar_url to User with migration"
```

---

## Task 3: Add `google_client_id` to settings

**Files:**
- Modify: `backend/app/config.py`
- Test: `backend/tests/test_config.py`

- [ ] **Step 1: Write the failing test**

Add to the end of `backend/tests/test_config.py`:

```python
def test_google_client_id_defaults_empty(monkeypatch):
    monkeypatch.delenv("PARAKH_GOOGLE_CLIENT_ID", raising=False)
    from app.config import Settings
    assert Settings().google_client_id == ""


def test_google_client_id_reads_env(monkeypatch):
    monkeypatch.setenv("PARAKH_GOOGLE_CLIENT_ID", "abc.apps.googleusercontent.com")
    from app.config import Settings
    assert Settings().google_client_id == "abc.apps.googleusercontent.com"
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `.venv/bin/pytest tests/test_config.py -v`
Expected: FAIL — `Settings` has no attribute `google_client_id`.

- [ ] **Step 3: Add the setting**

In `backend/app/config.py`, add a line inside `Settings` after `secret_key` (line 10):

```python
    secret_key: str = "dev-secret"  # signs auth tokens; set PARAKH_SECRET_KEY in prod
    google_client_id: str = ""  # OAuth client id; set PARAKH_GOOGLE_CLIENT_ID in prod
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `backend/`): `.venv/bin/pytest tests/test_config.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/tests/test_config.py
git commit -m "feat: add google_client_id setting (PARAKH_GOOGLE_CLIENT_ID)"
```

---

## Task 4: AuthService — add `login_google`, remove `login_email`

**Files:**
- Modify: `backend/app/services/auth.py`
- Test: `backend/tests/test_auth.py`

- [ ] **Step 1: Rewrite the auth tests for Google**

Replace the entire contents of `backend/tests/test_auth.py` with:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `.venv/bin/pytest tests/test_auth.py -v`
Expected: FAIL — `AuthService.__init__` takes no `google_client_id`, and `login_google` does not exist.

- [ ] **Step 3: Implement the changes in `auth.py`**

Replace the entire contents of `backend/app/services/auth.py` with:

```python
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `backend/`): `.venv/bin/pytest tests/test_auth.py -v`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auth.py backend/tests/test_auth.py
git commit -m "feat: add AuthService.login_google, remove email login"
```

---

## Task 5: Schemas — add Google request/response, remove email

**Files:**
- Modify: `backend/app/schemas.py`

- [ ] **Step 1: Replace the schemas file**

Replace the entire contents of `backend/app/schemas.py` with:

```python
from pydantic import BaseModel


class GuestRequest(BaseModel):
    device_id: str


class GoogleLoginRequest(BaseModel):
    id_token: str


class GoogleLoginResponse(BaseModel):
    token: str
    email: str
    name: str | None = None
    avatar_url: str | None = None


class TokenResponse(BaseModel):
    token: str


class BarcodeRequest(BaseModel):
    barcode: str
```

- [ ] **Step 2: Verify nothing imports the removed schema**

Run (from `backend/`): `grep -rn "EmailLoginRequest" app tests`
Expected: the only remaining hit is in `app/main.py` (fixed in Task 6). If `tests/` shows a hit, it will be fixed in Task 6 too.

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas.py
git commit -m "feat: add Google login schemas, remove EmailLoginRequest"
```

---

## Task 6: API route — add `/auth/google`, remove `/auth/login`

**Files:**
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_api.py`

- [ ] **Step 1: Write the failing API test**

Add to the end of `backend/tests/test_api.py`:

```python
def test_google_login_route_issues_token(monkeypatch):
    from unittest.mock import patch
    client = build_client()
    info = {"sub": "g-api", "email": "z@b.com", "name": "Zed", "picture": "http://x/z.png"}
    with patch("app.services.auth.google_id_token.verify_oauth2_token", return_value=info):
        r = client.post("/auth/google", json={"id_token": "fake"})
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "z@b.com"
    assert body["token"].startswith("user:")
    # The issued token authorizes a scan (counts against the free limit).
    headers = {"Authorization": f"Bearer {body['token']}"}
    assert client.post("/scan/barcode", json={"barcode": "x"},
                       headers=headers).status_code in (404, 200)


def test_google_login_route_rejects_bad_token():
    from unittest.mock import patch
    client = build_client()
    with patch("app.services.auth.google_id_token.verify_oauth2_token",
               side_effect=ValueError("bad")):
        r = client.post("/auth/google", json={"id_token": "bad"})
    assert r.status_code == 401
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `.venv/bin/pytest tests/test_api.py::test_google_login_route_issues_token -v`
Expected: FAIL — `/auth/google` returns 404 (route does not exist yet).

- [ ] **Step 3: Update imports and the `create_app` signature in `main.py`**

In `backend/app/main.py`, change the schemas import (line 14) from:

```python
from app.schemas import GuestRequest, EmailLoginRequest, TokenResponse, BarcodeRequest
```

to:

```python
from app.schemas import (GuestRequest, GoogleLoginRequest, GoogleLoginResponse,
                         TokenResponse, BarcodeRequest)
```

Change the `create_app` signature (lines 17-18) to accept `google_client_id`:

```python
def create_app(*, session_factory, off_client, label_extractor, secret,
               guest_limit, free_limit, google_client_id="", today=None):
```

Change the `AuthService` construction (line 25) to pass it:

```python
    auth = AuthService(session_factory, secret=secret, google_client_id=google_client_id)
```

- [ ] **Step 4: Replace the email route with the Google route**

In `backend/app/main.py`, replace the `auth_login` route (lines 63-68):

```python
    @app.post("/auth/login", response_model=TokenResponse)
    def auth_login(req: EmailLoginRequest):
        try:
            return {"token": auth.login_email(req.email)}
        except AuthError as e:
            raise HTTPException(status_code=400, detail=str(e))
```

with:

```python
    @app.post("/auth/google", response_model=GoogleLoginResponse)
    def auth_google(req: GoogleLoginRequest):
        try:
            return auth.login_google(req.id_token)
        except AuthError as e:
            raise HTTPException(status_code=401, detail=str(e))
```

- [ ] **Step 5: Pass `google_client_id` from settings in `app_from_settings`**

In `backend/app/main.py`, in `app_from_settings`, add the argument to the `create_app(...)` call (after `secret=settings.secret_key,`):

```python
        secret=settings.secret_key,
        google_client_id=settings.google_client_id,
        guest_limit=settings.guest_daily_limit,
        free_limit=settings.free_daily_limit,
```

- [ ] **Step 6: Run the API tests to verify they pass**

Run (from `backend/`): `.venv/bin/pytest tests/test_api.py -v`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 7: Run the full backend suite**

Run (from `backend/`): `.venv/bin/pytest -q`
Expected: PASS, 0 failures. (If a stray `login_email`/`EmailLoginRequest` reference remains anywhere, fix it now.)

- [ ] **Step 8: Commit**

```bash
git add backend/app/main.py backend/tests/test_api.py
git commit -m "feat: add POST /auth/google route, remove email login route"
```

---

## Task 7: Frontend session — add `googleLogin`, remove `emailLogin`

**Files:**
- Modify: `frontend/src/session/session.ts`
- Test: `frontend/src/session/session.test.ts`

- [ ] **Step 1: Rewrite the session test for Google**

In `frontend/src/session/session.test.ts`, change the import on line 2 from:

```ts
import { loadToken, saveToken, clearToken, guestLogin, emailLogin } from "./session";
```

to:

```ts
import { loadToken, saveToken, clearToken, guestLogin, googleLogin } from "./session";
```

Then replace the entire `describe("emailLogin", ...)` block (lines 30-39) with:

```ts
describe("googleLogin", () => {
  it("posts the id_token and stores the returned token and email", async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ token: "user:7.sig", email: "a@b.com", name: "Ada", avatar_url: null }),
    });
    vi.stubGlobal("fetch", spy);
    const res = await googleLogin("fake-credential");
    expect(res.token).toBe("user:7.sig");
    expect(res.email).toBe("a@b.com");
    expect(loadToken()).toBe("user:7.sig");
    const [path, init] = spy.mock.calls[0];
    expect(path).toContain("/auth/google");
    expect(JSON.parse(init.body).id_token).toBe("fake-credential");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `frontend/`): `npm test -- session.test.ts`
Expected: FAIL — `googleLogin` is not exported.

- [ ] **Step 3: Update `session.ts`**

In `frontend/src/session/session.ts`, replace the `emailLogin` function (lines 38-46) with:

```ts
export async function googleLogin(
  idToken: string,
): Promise<{ token: string; email: string | null }> {
  const res = await fetchJson<{ token: string; email: string; name: string | null; avatar_url: string | null }>(
    "/auth/google",
    { method: "POST", json: { id_token: idToken } },
  );
  saveToken(res.token);
  if (res.email) localStorage.setItem(EMAIL_KEY, res.email);
  return { token: res.token, email: res.email || null };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `frontend/`): `npm test -- session.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/session/session.ts frontend/src/session/session.test.ts
git commit -m "feat: add googleLogin, remove emailLogin (frontend session)"
```

---

## Task 8: SessionContext — expose `loginGoogle`, drop `login`

**Files:**
- Modify: `frontend/src/session/SessionContext.tsx`

- [ ] **Step 1: Rewrite `SessionContext.tsx`**

Replace the entire contents of `frontend/src/session/SessionContext.tsx` with:

```tsx
import { createContext, useContext, useState, type ReactNode } from "react";
import { loadToken, clearToken, guestLogin, googleLogin, loadEmail, isGuestToken } from "./session";

interface SessionValue {
  token: string | null;
  isGuest: boolean;
  email: string | null;
  guest: () => Promise<void>;
  loginGoogle: (credential: string) => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [email, setEmail] = useState<string | null>(() => loadEmail());

  const guest = async () => {
    setToken(await guestLogin());
    setEmail(null);
  };
  const loginGoogle = async (credential: string) => {
    const res = await googleLogin(credential);
    setToken(res.token);
    setEmail(res.email);
  };
  const signOut = () => {
    clearToken();
    setToken(null);
    setEmail(null);
  };

  return (
    <SessionContext.Provider
      value={{ token, isGuest: isGuestToken(token), email, guest, loginGoogle, signOut }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
```

- [ ] **Step 2: Run the context test to confirm no regression**

Run (from `frontend/`): `npm test -- SessionContext.test.tsx`
Expected: PASS (the existing test only exercises `guest`/`signOut`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/session/SessionContext.tsx
git commit -m "feat: expose loginGoogle on session context, drop email login"
```

---

## Task 9: Add the GIS script and env typing

**Files:**
- Modify: `frontend/index.html`
- Create: `frontend/.env.local.example`

- [ ] **Step 1: Add the GIS script to `index.html`**

In `frontend/index.html`, add this line inside `<head>` just before the closing `</head>` (after the fonts `<link>`):

```html
    <script src="https://accounts.google.com/gsi/client" async defer></script>
```

- [ ] **Step 2: Create the env example file**

Create `frontend/.env.local.example` with:

```
# Google OAuth 2.0 Web client ID (same value as the backend's PARAKH_GOOGLE_CLIENT_ID).
# Create at https://console.cloud.google.com/apis/credentials and add the app's
# origins to "Authorized JavaScript origins" (e.g. https://parakh.skdev.one and
# http://localhost:5173 for local dev).
VITE_GOOGLE_CLIENT_ID=
```

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html frontend/.env.local.example
git commit -m "feat: load Google Identity Services script; document VITE_GOOGLE_CLIENT_ID"
```

---

## Task 10: Rebuild AuthScreen UI + wire the Google button

**Files:**
- Modify: `frontend/src/screens/AuthScreen.tsx`
- Modify: `frontend/src/screens/AuthScreen.module.css`
- Test: `frontend/src/screens/AuthScreen.test.tsx`

- [ ] **Step 1: Rewrite the AuthScreen test**

Replace the entire contents of `frontend/src/screens/AuthScreen.test.tsx` with:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthScreen } from "./AuthScreen";

afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as unknown as { google?: unknown }).google;
});

describe("AuthScreen", () => {
  it("renders the headline and tagline", () => {
    render(<AuthScreen onGuest={vi.fn()} onGoogleLogin={vi.fn()} />);
    expect(screen.getByText(/really in your food/i)).toBeInTheDocument();
    expect(screen.getByText(/health score in seconds/i)).toBeInTheDocument();
  });

  it("continues as guest", async () => {
    const onGuest = vi.fn().mockResolvedValue(undefined);
    render(<AuthScreen onGuest={onGuest} onGoogleLogin={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /guest/i }));
    expect(onGuest).toHaveBeenCalledOnce();
  });

  it("shows an error when guest sign-in fails", async () => {
    const onGuest = vi.fn().mockRejectedValue(new Error("boom"));
    render(<AuthScreen onGuest={onGuest} onGoogleLogin={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /guest/i }));
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("forwards the Google credential to onGoogleLogin", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");
    let captured: ((r: { credential?: string }) => void) | null = null;
    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: (cfg: { callback: (r: { credential?: string }) => void }) => {
            captured = cfg.callback;
          },
          renderButton: () => {},
        },
      },
    };
    const onGoogleLogin = vi.fn().mockResolvedValue(undefined);
    render(<AuthScreen onGuest={vi.fn()} onGoogleLogin={onGoogleLogin} />);
    await waitFor(() => expect(captured).toBeTruthy());
    captured!({ credential: "fake-jwt" });
    expect(onGoogleLogin).toHaveBeenCalledWith("fake-jwt");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `frontend/`): `npm test -- AuthScreen.test.tsx`
Expected: FAIL — current `AuthScreen` requires `onEmailLogin` and has no Google wiring; the headline/credential assertions fail.

- [ ] **Step 3: Rewrite `AuthScreen.tsx`**

Replace the entire contents of `frontend/src/screens/AuthScreen.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";
import styles from "./AuthScreen.module.css";

interface Props {
  onGuest: () => Promise<void> | void;
  onGoogleLogin: (credential: string) => Promise<void> | void;
}

interface GoogleId {
  initialize: (cfg: {
    client_id: string;
    callback: (r: { credential?: string }) => void;
  }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

export function AuthScreen({ onGuest, onGoogleLogin }: Props) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) return;
    let cancelled = false;

    const tryRender = (): boolean => {
      const id = window.google?.accounts?.id;
      if (!id) return false;
      id.initialize({
        client_id: clientId,
        callback: (resp) => {
          if (resp.credential) {
            Promise.resolve(onGoogleLogin(resp.credential)).catch(() =>
              setError("We couldn't sign you in. Try again."),
            );
          }
        },
      });
      if (btnRef.current) {
        id.renderButton(btnRef.current, {
          type: "standard",
          theme: "outline",
          shape: "pill",
          size: "large",
          text: "continue_with",
          width: 280,
        });
      }
      return true;
    };

    if (tryRender()) return;
    const interval = setInterval(() => {
      if (cancelled || tryRender()) clearInterval(interval);
    }, 200);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [onGoogleLogin]);

  const doGuest = async () => {
    setError(null);
    setBusy(true);
    try {
      await onGuest();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.brand}>
        <span className={styles.leaf}>P</span>
        <span className={styles.wordmark}>
          Par<b>akh</b>
        </span>
      </div>

      <div className={styles.hero}>
        <div className={styles.art}>
          <span className={`${styles.corner} ${styles.c1}`} />
          <span className={`${styles.corner} ${styles.c2}`} />
          <span className={`${styles.corner} ${styles.c3}`} />
          <span className={`${styles.corner} ${styles.c4}`} />
          <span className={styles.beam} />
          <span className={styles.emoji} role="img" aria-label="canned food">
            🥫
          </span>
        </div>
        <h1 className={styles.headline}>
          Know what's
          <br />
          really in your food.
        </h1>
        <p className={styles.tagline}>
          Scan a pack and get one honest A–E health score in seconds.
        </p>
      </div>

      <div className={styles.auth}>
        <div className={styles.gbtnWrap}>
          <div ref={btnRef} data-testid="google-signin-btn" />
        </div>
        <div className={styles.divider}>or</div>
        <button className={styles.guest} disabled={busy} onClick={doGuest}>
          Just looking? <b>Continue as guest →</b>
        </button>
        {error && <div className={styles.err}>{error}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `AuthScreen.module.css`**

Replace the entire contents of `frontend/src/screens/AuthScreen.module.css` with:

```css
.screen {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 26px 28px 30px;
  text-align: center;
  color: #fff;
  background: linear-gradient(177deg, #11231b 0%, #0d1512 60%, #0b0f0d 100%);
}

.brand { display: flex; align-items: center; gap: 10px; }
.leaf {
  width: 32px; height: 32px; border-radius: 10px;
  background: var(--lime); color: #0d1512;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 800;
  box-shadow: 0 6px 16px -6px rgba(199, 249, 76, 0.6);
}
.wordmark { font-size: 19px; font-weight: 800; letter-spacing: -0.01em; }
.wordmark b { color: var(--lime); }

.hero {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding-top: 30px;
}
.art {
  width: 158px; height: 158px; border-radius: 38px; position: relative;
  background:
    radial-gradient(120px 120px at 30% 25%, rgba(199, 249, 76, 0.18), transparent 70%),
    linear-gradient(150deg, #1fa463, #0b3d2c);
  box-shadow: 0 30px 60px -24px rgba(31, 164, 99, 0.65), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  display: flex; align-items: center; justify-content: center;
}
.emoji { font-size: 60px; filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.3)); }
.corner { position: absolute; width: 26px; height: 26px; border: 3.5px solid var(--lime); }
.c1 { top: 18px; left: 18px; border-right: 0; border-bottom: 0; border-radius: 9px 0 0 0; }
.c2 { top: 18px; right: 18px; border-left: 0; border-bottom: 0; border-radius: 0 9px 0 0; }
.c3 { bottom: 18px; left: 18px; border-right: 0; border-top: 0; border-radius: 0 0 0 9px; }
.c4 { bottom: 18px; right: 18px; border-left: 0; border-top: 0; border-radius: 0 0 9px 0; }
.beam {
  position: absolute; left: 18px; right: 18px; top: 50%; height: 3px; border-radius: 3px;
  background: linear-gradient(90deg, transparent, var(--lime), transparent);
  box-shadow: 0 0 14px 2px rgba(199, 249, 76, 0.5);
}

.headline { font-size: 28px; font-weight: 800; line-height: 1.16; letter-spacing: -0.02em; margin-top: 34px; }
.tagline { color: #9aa89c; font-size: 14.5px; margin-top: 14px; line-height: 1.55; max-width: 260px; }

.auth { margin-top: 40px; }
.gbtnWrap { display: flex; justify-content: center; min-height: 44px; }
.divider {
  display: flex; align-items: center; gap: 12px; margin: 22px 4px 0;
  color: #5d6b5f; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
}
.divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: rgba(255, 255, 255, 0.09); }
.guest {
  display: block; width: 100%; margin-top: 16px; padding: 8px;
  background: transparent; text-align: center; font-size: 14px; font-weight: 600; color: #b7c3b8;
}
.guest b { color: var(--lime); font-weight: 700; }
.err { font-size: 12px; color: var(--red); text-align: center; font-weight: 600; margin-top: 12px; }
```

- [ ] **Step 5: Run the AuthScreen test to verify it passes**

Run (from `frontend/`): `npm test -- AuthScreen.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/screens/AuthScreen.tsx frontend/src/screens/AuthScreen.module.css frontend/src/screens/AuthScreen.test.tsx
git commit -m "feat: redesign sign-in screen with Google button (C-refined mockup)"
```

---

## Task 11: Wire AuthScreen into App

**Files:**
- Modify: `frontend/src/App.tsx:15,31-33`

- [ ] **Step 1: Update the session destructuring and AuthScreen usage**

In `frontend/src/App.tsx`, change line 15 from:

```tsx
  const { token, isGuest, email, guest, login, signOut } = useSession();
```

to:

```tsx
  const { token, isGuest, email, guest, loginGoogle, signOut } = useSession();
```

Then change the AuthScreen render (lines 31-33) from:

```tsx
  if (!token) {
    return <AuthScreen onGuest={guest} onEmailLogin={login} />;
  }
```

to:

```tsx
  if (!token) {
    return <AuthScreen onGuest={guest} onGoogleLogin={loginGoogle} />;
  }
```

- [ ] **Step 2: Run the App test to confirm no regression**

Run (from `frontend/`): `npm test -- App.test.tsx`
Expected: PASS (its flows use the guest button only).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire Google login into App auth flow"
```

---

## Task 12: Full verification (tests + typecheck/build)

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend suite**

Run (from `backend/`): `.venv/bin/pytest -q`
Expected: all pass, 0 failures. Read the final summary line and confirm `0 failed`.

- [ ] **Step 2: Run the full frontend suite**

Run (from `frontend/`): `npm test`
Expected: all test files pass. Read the summary and confirm `0 failed` / no failing files.

- [ ] **Step 3: Typecheck + production build**

Run (from `frontend/`): `npm run build`
Expected: `tsc -b` reports no type errors and `vite build` completes with a `dist/` bundle. Any TS error (e.g. a leftover `onEmailLogin`/`login` reference) fails the build — fix and re-run.

- [ ] **Step 4: Confirm no dead references remain**

Run (from repo root): `grep -rn "onEmailLogin\|emailLogin\|login_email\|EmailLoginRequest\|/auth/login" backend/app frontend/src`
Expected: no matches.

- [ ] **Step 5: Commit (only if Steps 1-4 required fixes)**

```bash
git add -A
git commit -m "test: fix references after Google Sign-In migration"
```

---

## Task 13: Configuration & deploy (operator checklist)

> These steps require the user's Google Cloud Console and production credentials; they are not automated. Do them after all tests pass.

- [ ] **Step 1: Create the OAuth client (user)**

In Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → **Web application**:
- Authorized JavaScript origins: `https://parakh.skdev.one` and `http://localhost:5173`.
- No redirect URIs / no client secret are needed (ID-token verification flow).
- Copy the generated **Client ID**.

- [ ] **Step 2: Set the frontend env**

- Local: create `frontend/.env.local` (gitignored) with `VITE_GOOGLE_CLIENT_ID=<client id>`.
- Vercel: add `VITE_GOOGLE_CLIENT_ID=<client id>` to the project's Environment Variables (Production), then redeploy (a push to `main` auto-deploys).

- [ ] **Step 3: Set the backend env on the VM**

On the VM, append to `~/parakh/backend/.env`: `PARAKH_GOOGLE_CLIENT_ID=<client id>` (same value as the frontend).

- [ ] **Step 4: Redeploy the backend**

Run on the VM: `cd ~/parakh && git pull -q && cd backend && docker compose up -d --build --force-recreate`
Expected: container `parakh-backend` rebuilds (now installing `google-auth`) and restarts healthy. The lightweight migration adds the new `users` columns on startup.

- [ ] **Step 5: Smoke-test in the browser**

Open `https://parakh.skdev.one`, confirm the new sign-in screen renders, the Google button appears, signing in lands on Home, and "Continue as guest" still works.
