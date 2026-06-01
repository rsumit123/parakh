# Google Sign-In + Sign-In Screen Redesign — Design Spec

**Date:** 2026-06-01
**Status:** Approved (design), pending implementation plan

## Goal

Replace the unverified email login with real **Google Sign-In** (keeping anonymous **guest** access), and redesign the pre-sign-in landing screen so the app is branded, polished, and shareable on mobile.

## Why

- The current "Continue with email" lets anyone in with any string containing `@` — there is no verification. It is a security hole and gives us no real identity.
- The current landing screen (see `frontend/src/screens/AuthScreen.tsx`) has a dead vertical gap, a white bottom sheet that clashes with the dark theme, and no real branding — not something the user can share.

## Scope

**In scope**
- Backend `POST /auth/google` that verifies a Google ID token and issues our existing `user:<id>` token.
- New `User` columns: `google_id`, `display_name`, `avatar_url`.
- Remove the email login path (backend `POST /auth/login`, `login_email`, `EmailLoginRequest`; frontend email UI + `emailLogin`).
- Frontend: Google Identity Services (GIS) button on a redesigned dark landing screen (the approved "C refined" mockup), keep "Continue as guest".
- Env vars: backend `PARAKH_GOOGLE_CLIENT_ID`, frontend `VITE_GOOGLE_CLIENT_ID`.

**Out of scope**
- Native (Capacitor) Google sign-in — Parakh is a web PWA only.
- Account-merge UI, profile editing, paid tier, password auth.
- Migrating existing email-created users (early stage, negligible count; they simply re-auth via Google or guest).

## Architecture

### Auth model (unchanged token scheme)

We keep the existing opaque HMAC-signed token: payload `guest:<device>` or `user:<id>`, signed with `PARAKH_SECRET_KEY` (`backend/app/services/auth.py:_sign`). Google sign-in slots in by **issuing the same `user:<id>` token** after verifying the Google identity — so rate-limiting, daily-scan counting, and `identify()` keep working with zero changes downstream.

### Flow

```
Browser (GIS button)
  → user taps "Continue with Google"
  → Google returns a credential (ID token JWT) to our JS callback
  → POST /auth/google { id_token }
Backend
  → verify_oauth2_token(id_token, Request(), PARAKH_GOOGLE_CLIENT_ID)  [google-auth lib]
  → extract sub (google_id), email, name, picture
  → find User by google_id → else by email (link) → else create
  → issue token  user:<id>
  → respond { token, email, name, avatar_url }
Browser
  → save token (+ email/name) to localStorage, enter the app
```

### Backend changes

**`backend/pyproject.toml`** — add dependency `google-auth>=2.27.0`.

**`backend/app/config.py`** — add `google_client_id: str = ""` (env `PARAKH_GOOGLE_CLIENT_ID`).

**`backend/app/models.py`** — add to `User`:
- `google_id: Mapped[str | None]` (nullable, unique)
- `display_name: Mapped[str | None]`
- `avatar_url: Mapped[str | None]`

**`backend/app/db.py`** — extend `_ADDED_COLUMNS` so existing DBs get the new columns:
```python
"users": {
    "google_id": "VARCHAR",
    "display_name": "VARCHAR",
    "avatar_url": "VARCHAR",
},
```

**`backend/app/services/auth.py`** — add a module-level Google verifier and an `AuthService.login_google` method:
- Module imports: `from google.oauth2 import id_token as google_id_token` and `from google.auth.transport import requests as google_requests`.
- `AuthService.__init__` gains a `google_client_id` param.
- `login_google(id_token: str) -> str`:
  - Verify: `info = google_id_token.verify_oauth2_token(id_token, google_requests.Request(), self._google_client_id)`. On any exception → raise `AuthError("invalid google token")`.
  - `google_id = info["sub"]`, `email = info.get("email", "")`, `name = info.get("name")`, `picture = info.get("picture")`.
  - Find `User` by `google_id`; else by `email` (and set `google_id` to link); else create `User(email, google_id, display_name=name, avatar_url=picture, auth_provider="google", tier="free")`.
  - Commit; return a dict `{"token": self._make_token(f"user:{user.id}"), "email": user.email, "name": user.display_name, "avatar_url": user.avatar_url}` — the route maps this straight onto `GoogleLoginResponse`.
- Remove `login_email`.

**`backend/app/schemas.py`** — add `GoogleLoginRequest { id_token: str }` and `GoogleLoginResponse { token: str; email: str; name: str | None; avatar_url: str | None }`. Remove `EmailLoginRequest`.

**`backend/app/main.py`** — add `POST /auth/google` returning `GoogleLoginResponse`; on `AuthError` raise `HTTPException(401)`. Remove `POST /auth/login`. Pass `google_client_id=settings.google_client_id` into `AuthService` (in both `create_app` and `app_from_settings`).

> CORS already uses `allow_origins=["*"]`, so no change needed there. (Tokens are sent via `Authorization` header, not cookies.)

### Frontend changes

**`frontend/index.html`** — add the GIS script in `<head>`:
```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

**`frontend/src/session/session.ts`** — remove `emailLogin`; add:
```ts
export async function googleLogin(idToken: string): Promise<{ token: string; email: string | null; name: string | null }> {
  const res = await fetchJson<{ token: string; email: string; name: string | null; avatar_url: string | null }>(
    "/auth/google", { method: "POST", json: { id_token: idToken } });
  saveToken(res.token);
  if (res.email) localStorage.setItem(EMAIL_KEY, res.email);
  if (res.name) localStorage.setItem(NAME_KEY, res.name);
  return { token: res.token, email: res.email || null, name: res.name };
}
```
(Adds a `NAME_KEY` for the display name; `clearToken` also clears it.)

**`frontend/src/session/SessionContext.tsx`** — replace `login(email)` with `loginGoogle(credential: string)`; drop the email-login method. Keep `guest`, `signOut`, `isGuest`. `email`/display label sourced from stored values.

**`frontend/src/App.tsx`** — `<AuthScreen onGuest={guest} onGoogleLogin={loginGoogle} />`.

**`frontend/src/screens/AuthScreen.tsx` + `.module.css`** — redesign to the approved **"C refined"** mockup and wire the Google button:
- Layout: three vertical bands on one dark surface (gradient `#11231b → #0d1512 → #0b0f0d`), even 28px side margins:
  1. **Brand** (top-left): lime rounded "P" tile + "Par**akh**" wordmark.
  2. **Hero** (centered in free space): a rounded gradient "scan-frame" tile (lime corner brackets + a glowing scan beam, food emoji inside), headline **"Know what's really in your food."**, subtext **"Scan a pack and get one honest A–E health score in seconds."**
  3. **Auth** (anchored bottom, with a firm gap above): the Google button, an "or" divider, then "Just looking? **Continue as guest →**".
- No white sheet. No scan-limit caption (removed).
- **Google button:** render the official GIS button via `google.accounts.id.initialize({ client_id, callback })` + `renderButton(ref, { type: "standard", theme: "outline", shape: "pill", size: "large", text: "continue_with", width })` inside a `useEffect` that polls for `window.google?.accounts?.id` (same pattern as charade-chat `Welcome.jsx`). The callback receives `response.credential` and calls `onGoogleLogin(credential)`.
  - **Tradeoff (accepted):** the button is Google's own rendered outline/pill button, not a pixel-perfect custom pill. This is the secure, supported path for the credential flow and visually matches the mockup's intent (white pill, Google logo, "Continue with Google"). A fully custom-styled button would require a manual OAuth redirect flow — explicitly out of scope.
- Keep the existing guest button behavior and the busy/error states.

### Env / config (user-provided)

- User creates a **new OAuth 2.0 Web client** in Google Cloud Console.
  - Authorized JavaScript origins: `https://parakh.skdev.one` (+ `http://localhost:5173` for local dev).
  - No client secret needed (ID-token verification flow).
- Backend `.env` on the VM: `PARAKH_GOOGLE_CLIENT_ID=<client id>`.
- Frontend: `VITE_GOOGLE_CLIENT_ID=<client id>` in Vercel env (and `.env.local` for dev). Same client ID on both sides.

## Testing

**Backend (pytest)** — patch `app.services.auth.google_id_token.verify_oauth2_token` (mirrors charade-chat `test_auth.py`):
- New Google user is created and gets a `user:<id>` token.
- Same `sub` on a second call returns the same user (no duplicate).
- Existing email user with matching email is linked to `google_id` (no new row).
- Invalid token (verify raises) → `POST /auth/google` returns 401.
- Issued token passes `identify()` and counts against the **free** daily limit.
- Lightweight migration adds `google_id/display_name/avatar_url` to a pre-existing `users` table.

**Frontend (vitest)** — rewrite `AuthScreen.test.tsx` and `session.test.ts`:
- AuthScreen renders brand, headline, guest link; calls `onGuest` on guest click; renders a container for the Google button. (GIS `window.google` is mocked/stubbed; assert `initialize`/`renderButton` called when present, and that the callback forwards the credential to `onGoogleLogin`.)
- `googleLogin` POSTs to `/auth/google` with `{ id_token }`, saves token + email/name.
- Remove email-login tests.

## Risks / Notes

- GIS requires the configured origin to exactly match; localhost dev needs its own origin entry. Document in the plan.
- `verify_oauth2_token` makes a network call to fetch Google's signing keys; always mocked in tests, real in prod.
- Removing email login orphans any existing email-only users — acceptable at current scale.
- The OpenRouter API key the user shared earlier should still be rotated (tracked separately; not part of this change).
