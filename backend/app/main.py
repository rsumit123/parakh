from datetime import datetime, timezone

from fastapi import FastAPI, Depends, Header, HTTPException, Form, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository
from app.clients.openfoodfacts import OpenFoodFactsClient
from app.clients.label_extractor import LabelExtractor, ExtractionError
from app.services.rate_limiter import RateLimiter
from app.services.auth import AuthService, AuthError
from app.services.scan import ScanService, ProductNotFound
from app.schemas import GuestRequest, EmailLoginRequest, TokenResponse, BarcodeRequest


def create_app(*, session_factory, off_client, label_extractor, secret,
               guest_limit, free_limit, today=None):
    """Build the app from injected dependencies. `today` (ISO date) is injectable
    for deterministic tests; in production it is computed per-request."""
    app = FastAPI(title="Parakh API")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                       allow_headers=["*"])

    auth = AuthService(session_factory, secret=secret)
    limiter = RateLimiter(session_factory, guest_limit=guest_limit, free_limit=free_limit)
    scanner = ScanService(ProductRepository(session_factory), off_client, label_extractor)

    def _today() -> str:
        if today is not None:
            return today
        return datetime.now(timezone.utc).date().isoformat()

    def current_identity(authorization: str = Header(default="")) -> dict:
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="missing bearer token")
        try:
            return auth.identify(authorization[len("Bearer "):])
        except AuthError as e:
            raise HTTPException(status_code=401, detail=str(e))

    def _ensure_quota(identity: dict) -> None:
        # Read-only check up front so an over-quota user is blocked before any work,
        # but quota is only *consumed* on a successful scan (see _consume). This keeps
        # the unknown-product flow fair: a 404 needs-photo or a 422 unreadable label
        # does not burn the user's daily scan allowance.
        if limiter.remaining(identity["id"], identity["tier"], day=_today()) <= 0:
            raise HTTPException(status_code=429,
                                detail={"error": "daily scan limit reached"})

    def _consume(identity: dict) -> int:
        # Called only after a scan resolves successfully.
        res = limiter.check_and_consume(identity["id"], identity["tier"], day=_today())
        return res["remaining"]

    @app.post("/auth/guest", response_model=TokenResponse)
    def auth_guest(req: GuestRequest):
        try:
            return {"token": auth.guest_token(req.device_id)}
        except AuthError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.post("/auth/login", response_model=TokenResponse)
    def auth_login(req: EmailLoginRequest):
        try:
            return {"token": auth.login_email(req.email)}
        except AuthError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.post("/scan/barcode")
    def scan_barcode(req: BarcodeRequest, identity: dict = Depends(current_identity)):
        _ensure_quota(identity)
        try:
            result = scanner.scan_barcode(req.barcode)
        except ProductNotFound:
            raise HTTPException(status_code=404,
                                detail={"error": "product not found",
                                        "needs_photo": True})
        remaining = _consume(identity)
        return {**result, "remaining": remaining}

    @app.post("/scan/photo")
    async def scan_photo(barcode: str = Form(...), image: UploadFile = File(...),
                         identity: dict = Depends(current_identity)):
        _ensure_quota(identity)
        image_bytes = await image.read()
        try:
            result = scanner.scan_photo(barcode, image_bytes)
        except ExtractionError:
            raise HTTPException(status_code=422,
                                detail={"error": "could not read label, retake photo"})
        remaining = _consume(identity)
        return {**result, "remaining": remaining}

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


def app_from_settings() -> FastAPI:
    """Build the production app. DB initialization is deferred to a startup event so
    that merely importing this module never touches the filesystem (no DB file is
    created at import time)."""
    settings = get_settings()
    engine = make_engine(settings.db_url)
    sf = make_session_factory(engine)
    app = create_app(
        session_factory=sf,
        off_client=OpenFoodFactsClient(),
        label_extractor=LabelExtractor(
            api_key=settings.openrouter_api_key, model=settings.vision_model,
            url=settings.openrouter_url),
        secret=settings.secret_key,
        guest_limit=settings.guest_daily_limit,
        free_limit=settings.free_daily_limit,
    )

    @app.on_event("startup")
    def _init_db_on_startup():
        init_db(engine)

    return app


app = app_from_settings()
