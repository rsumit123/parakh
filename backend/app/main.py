from datetime import datetime, timezone

from fastapi import FastAPI, Depends, Header, HTTPException, Form, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository
from app.clients.openfoodfacts import OpenFoodFactsClient
from app.clients.label_extractor import LabelExtractor, ExtractionError
from app.services.meal_estimator import MealEstimator, MealEstimateError
from app.scoring.scorer import score as score_fn
from app.services.rate_limiter import RateLimiter
from app.services.auth import AuthService, AuthError
from app.services.scan import ScanService, ProductNotFound
from app.schemas import (GuestRequest, GoogleLoginRequest, GoogleLoginResponse,
                         TokenResponse, BarcodeRequest, DietLogRequest, ProfileRequest)
from app.repositories.diet import DietRepository
from app.nutrition.targets import compute_targets, summarize_day, MACRO_KEYS


def create_app(*, session_factory, off_client, label_extractor, meal_estimator=None,
               secret, guest_limit, free_limit, google_client_id="", today=None):
    """Build the app from injected dependencies. `today` (ISO date) is injectable
    for deterministic tests; in production it is computed per-request."""
    app = FastAPI(title="Parakh API")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                       allow_headers=["*"])

    auth = AuthService(session_factory, secret=secret, google_client_id=google_client_id)
    limiter = RateLimiter(session_factory, guest_limit=guest_limit, free_limit=free_limit)
    scanner = ScanService(ProductRepository(session_factory), off_client, label_extractor)
    catalog = ProductRepository(session_factory)
    diet = DietRepository(session_factory)

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

    def current_user(identity: dict = Depends(current_identity)) -> dict:
        """Diet tracking is for signed-in users only; reject guest tokens."""
        if identity["tier"] == "guest" or identity["id"].startswith("guest:"):
            raise HTTPException(status_code=401, detail={"error": "sign in to track"})
        return identity

    def _day_payload(identity_id: str, day: str) -> dict:
        entries = diet.day_entries(identity_id, day)
        targets = compute_targets(diet.get_profile(identity_id))
        summary = summarize_day(entries, targets)
        return {"date": day, "entries": entries, "targets": targets,
                "totals": summary["totals"], "status": summary["status"],
                "headline": summary["headline"]}

    def _entry_macros(req: DietLogRequest) -> dict:
        if req.kind == "packaged" and req.barcode:
            product = catalog.get(req.barcode)
            per100g = (product or {}).get("nutrition", {}) if product else {}
        else:
            per100g = req.per100g or {}
        q = req.quantity_g
        return {k: float(per100g.get(k, 0) or 0) * q / 100.0 for k in MACRO_KEYS}

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

    @app.post("/auth/google", response_model=GoogleLoginResponse)
    def auth_google(req: GoogleLoginRequest):
        try:
            return auth.login_google(req.id_token)
        except AuthError as e:
            raise HTTPException(status_code=401, detail=str(e))

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

    @app.post("/diet/log")
    def diet_log(req: DietLogRequest, identity: dict = Depends(current_user)):
        day = req.day or _today()
        macros = _entry_macros(req)
        entry = diet.add_entry(identity=identity["id"], day=day, kind=req.kind,
                               name=req.name, brand=req.brand, quantity_g=req.quantity_g,
                               macros=macros, barcode=req.barcode, image_url=req.image_url)
        return {"entry": entry, **_day_payload(identity["id"], day)}

    @app.post("/diet/estimate")
    async def diet_estimate(image: UploadFile = File(...),
                            identity: dict = Depends(current_user)):
        if meal_estimator is None:
            raise HTTPException(status_code=503, detail={"error": "estimator unavailable"})
        _ensure_quota(identity)
        image_bytes = await image.read()
        try:
            est = meal_estimator.estimate(image_bytes)
        except MealEstimateError:
            raise HTTPException(status_code=422,
                                detail={"error": "could not read the meal, retake photo"})
        scored = score_fn([], {**est["per100g"], "fruit_veg_nuts_pct": 0}, "")
        _consume(identity)
        return {**est, "grade": scored["grade"]}

    @app.get("/diet/profile")
    def diet_get_profile(identity: dict = Depends(current_user)):
        profile = diet.get_profile(identity["id"])
        return {"profile": profile, "effective_targets": compute_targets(profile)}

    @app.put("/diet/profile")
    def diet_put_profile(req: ProfileRequest, identity: dict = Depends(current_user)):
        profile = diet.upsert_profile(identity["id"], req.model_dump(exclude_unset=True))
        return {"profile": profile, "effective_targets": compute_targets(profile)}

    @app.get("/diet/day")
    def diet_day(date: str = "", identity: dict = Depends(current_user)):
        return _day_payload(identity["id"], date or _today())

    @app.delete("/diet/log/{entry_id}")
    def diet_delete(entry_id: int, date: str = "", identity: dict = Depends(current_user)):
        ok = diet.delete_entry(identity["id"], entry_id)
        if not ok:
            raise HTTPException(status_code=404, detail={"error": "entry not found"})
        return {"ok": True, **_day_payload(identity["id"], date or _today())}

    @app.get("/catalog/categories")
    def catalog_categories(identity: dict = Depends(current_identity)):
        return {"categories": catalog.category_counts()}

    @app.get("/catalog/products")
    def catalog_products(category: str = "", grade: str = "", q: str = "",
                         limit: int = 60, offset: int = 0,
                         identity: dict = Depends(current_identity)):
        g = grade.upper()
        if g not in ("A", "B", "C", "D", "E"):
            g = ""
        return catalog.list_products(category=category, grade=g, q=q,
                                     limit=limit, offset=offset)

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
        meal_estimator=MealEstimator(
            api_key=settings.openrouter_api_key, model=settings.vision_model,
            url=settings.openrouter_url),
        secret=settings.secret_key,
        google_client_id=settings.google_client_id,
        guest_limit=settings.guest_daily_limit,
        free_limit=settings.free_daily_limit,
    )

    @app.on_event("startup")
    def _init_db_on_startup():
        init_db(engine)

    return app


app = app_from_settings()
