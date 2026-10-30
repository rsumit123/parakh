from datetime import date as Date, datetime, timedelta, timezone

from fastapi import FastAPI, Depends, Header, HTTPException, Form, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository
from app.clients.openfoodfacts import OpenFoodFactsClient
from app.clients.label_extractor import LabelExtractor, ExtractionError
from app.services.meal_estimator import MealEstimator, MealEstimateError
from app.services.photos import PhotoStore, PhotoError, KEY_PREFIX, user_prefix
from app.services.rate_limiter import RateLimiter
from app.services.auth import AuthService, AuthError
from app.services.scan import ScanService, ProductNotFound
from app.schemas import (GuestRequest, GoogleLoginRequest, GoogleLoginResponse,
                         TokenResponse, BarcodeRequest, DietLogRequest, DietEditRequest, RepeatRequest, WeightRequest,
                         ProfileRequest)
from app.repositories.diet import DietRepository
from app.nutrition.suggest import suggest_meals
from app.nutrition.foods import catalog as food_catalog
from app.nutrition.gaps import close_gaps
from app.nutrition.targets import (compute_targets, summarize_day, is_personalised, targets_basis,
                                   MACRO_KEYS, OPTIONAL_KEYS)


def create_app(*, session_factory, off_client, label_extractor, meal_estimator=None,
               secret, guest_limit, free_limit, google_client_id="", today=None,
               photo_store=None):
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

    def _present(entry: dict) -> dict:
        """Stored meal-photo keys become short-lived signed URLs (bucket is private)."""
        img = entry.get("image_url") or ""
        if img.startswith(KEY_PREFIX):
            try:
                url = photo_store.url(img) if photo_store else ""
            except Exception:  # signing is local; never fail a day view over a photo
                url = ""
            return {**entry, "image_url": url}
        return entry

    def _day_payload(identity_id: str, day: str) -> dict:
        entries = [_present(e) for e in diet.day_entries(identity_id, day)]
        profile = diet.get_profile(identity_id)
        targets = compute_targets(profile)
        summary = summarize_day(entries, targets)
        return {"date": day, "entries": entries, "targets": targets, "partial": summary["partial"],
                "personalised": is_personalised(profile),
                "totals": summary["totals"], "status": summary["status"],
                "headline": summary["headline"]}

    def _entry_macros(req: DietLogRequest) -> dict:
        if req.kind == "packaged" and req.barcode:
            product = catalog.get(req.barcode)
            per100g = (product or {}).get("nutrition", {}) if product else {}
        else:
            per100g = req.per100g or {}
        q = req.quantity_g
        out = {}
        for k in MACRO_KEYS:
            v = per100g.get(k)
            # unknown carbs/fat stay unknown rather than counting as 0
            out[k] = None if (v is None and k in OPTIONAL_KEYS) else float(v or 0) * q / 100.0
        return out

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
        image = ""
        if req.photo_key:
            # Only a key this user uploaded; never a client-supplied URL.
            if not req.photo_key.startswith(user_prefix(identity["id"])) or ".." in req.photo_key:
                raise HTTPException(status_code=422, detail={"error": "bad photo key"})
            image = req.photo_key
        entry = diet.add_entry(identity=identity["id"], day=day, kind=req.kind,
                               name=req.name, brand=req.brand, quantity_g=req.quantity_g,
                               macros=macros, barcode=req.barcode, image_url=image,
                               meal=req.meal)
        return {"entry": _present(entry), **_day_payload(identity["id"], day)}

    @app.post("/diet/photo")
    async def diet_photo(image: UploadFile = File(...), identity: dict = Depends(current_user)):
        if photo_store is None:
            raise HTTPException(status_code=503, detail={"error": "photos unavailable"})
        data = await image.read()
        if len(data) > 15 * 1024 * 1024:
            raise HTTPException(status_code=413, detail={"error": "photo too large"})
        try:
            key = photo_store.save(identity["id"], data)
        except PhotoError:
            raise HTTPException(status_code=422, detail={"error": "not an image"})
        return {"photo_key": key, "url": photo_store.url(key)}

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
        _consume(identity)
        return est  # {"items": [{name, portion_g, per100g}, ...]}

    def _profile_payload(profile: dict) -> dict:
        # computed_targets = before overrides, so the client can tell which values the
        # user has pinned and offer "reset to calculated".
        return {"profile": profile, "personalised": is_personalised(profile),
                "basis": targets_basis(profile),
                "effective_targets": compute_targets(profile),
                "computed_targets": compute_targets(profile, with_overrides=False)}

    @app.get("/diet/profile")
    def diet_get_profile(identity: dict = Depends(current_user)):
        return _profile_payload(diet.get_profile(identity["id"]))

    @app.put("/diet/profile")
    def diet_put_profile(req: ProfileRequest, identity: dict = Depends(current_user)):
        return _profile_payload(diet.upsert_profile(identity["id"], req.model_dump(exclude_unset=True)))

    def _weight_payload(identity_id: str, days: int = 90, end: str = "") -> dict:
        try:
            end_d = Date.fromisoformat(end or _today())
        except ValueError:
            raise HTTPException(status_code=422, detail={"error": "bad end date"})
        start = (end_d - timedelta(days=max(1, min(days, 400)) - 1)).isoformat()
        profile = diet.get_profile(identity_id)
        return {"entries": diet.weights(identity_id, start, end_d.isoformat()),
                "latest": (diet.weights(identity_id)[-1:] or [None])[0], "goal": profile.get("goal")}

    @app.get("/diet/weight")
    def diet_weight(days: int = 90, end: str = "", identity: dict = Depends(current_user)):
        """Weigh-ins for the `days` days ending at `end`, plus the latest ever."""
        return _weight_payload(identity["id"], days, end)

    @app.put("/diet/weight")
    def diet_log_weight(req: WeightRequest, identity: dict = Depends(current_user)):
        try:
            Date.fromisoformat(req.day)
        except ValueError:
            raise HTTPException(status_code=422, detail={"error": "bad day"})
        diet.log_weight(identity["id"], req.day, round(req.weight_kg, 1))
        return _weight_payload(identity["id"], end=max(req.day, _today()))

    @app.delete("/diet/weight/{day}")
    def diet_delete_weight(day: str, identity: dict = Depends(current_user)):
        if not diet.delete_weight(identity["id"], day):
            raise HTTPException(status_code=404, detail={"error": "no weigh-in that day"})
        return _weight_payload(identity["id"])

    @app.get("/diet/suggestions")
    def diet_suggestions(date: str = "", identity: dict = Depends(current_user)):
        """Usual meals per slot from the 14 days before `date` (the viewed day itself
        is excluded, so suggestions are for filling it)."""
        try:
            d = Date.fromisoformat(date or _today())
        except ValueError:
            raise HTTPException(status_code=422, detail={"error": "bad date"})
        start, end = (d - timedelta(days=14)).isoformat(), (d - timedelta(days=1)).isoformat()
        return {"date": d.isoformat(), "slots": suggest_meals(diet.range_entries(identity["id"], start, end))}

    @app.post("/diet/repeat")
    def diet_repeat(req: RepeatRequest, identity: dict = Depends(current_user)):
        """Copy a past meal's entries into `day`/`meal` (photos copied too)."""
        try:
            Date.fromisoformat(req.day)
        except ValueError:
            raise HTTPException(status_code=422, detail={"error": "bad day"})
        sources = [diet.get_entry(identity["id"], i) for i in req.entry_ids]
        if any(s is None for s in sources):
            raise HTTPException(status_code=404, detail={"error": "entry not found"})
        created = []
        for s in sources:
            image = s.get("image_url") or ""
            if image.startswith(KEY_PREFIX):
                try:
                    image = photo_store.copy(identity["id"], image) if photo_store else ""
                except Exception:
                    image = ""  # the meal still gets logged, just without the photo
            created.append(diet.add_entry(
                identity=identity["id"], day=req.day, kind=s["kind"], name=s["name"], brand=s["brand"],
                quantity_g=s["quantity_g"], macros={k: s.get(k) for k in MACRO_KEYS},
                barcode=s.get("barcode"), image_url=image, meal=req.meal))
        # "created" (not "entries"): the day payload has its own "entries" (the whole day)
        return {**_day_payload(identity["id"], req.day), "created": [_present(e) for e in created]}

    @app.get("/diet/recent")
    def diet_recent(limit: int = 20, identity: dict = Depends(current_user)):
        return {"items": diet.recent_foods(identity["id"], limit=max(1, min(limit, 50)))}

    @app.get("/diet/gaps")
    def diet_gaps(date: str = "", identity: dict = Depends(current_user)):
        """Foods to close the day's protein / fibre shortfall within the calories left."""
        day = _day_payload(identity["id"], date or _today())
        if not day["entries"]:
            return {"gaps": {}, "kcal_left": None, "ideas": []}
        return close_gaps(day["totals"], day["targets"], diet.recent_foods(identity["id"], limit=50))

    @app.get("/diet/foods")
    def diet_foods(identity: dict = Depends(current_user)):
        """Reference Indian foods for search-and-add (static; the app caches it)."""
        return {"foods": food_catalog()}

    @app.get("/diet/day")
    def diet_day(date: str = "", identity: dict = Depends(current_user)):
        return _day_payload(identity["id"], date or _today())

    @app.patch("/diet/log/{entry_id}")
    def diet_edit(entry_id: int, req: DietEditRequest, identity: dict = Depends(current_user)):
        if req.quantity_g is not None and req.quantity_g < 0:
            raise HTTPException(status_code=422, detail={"error": "quantity must be >= 0"})
        entry = diet.update_entry(identity["id"], entry_id, name=req.name,
                                  quantity_g=req.quantity_g, macros=req.macros, meal=req.meal)
        if entry is None:
            raise HTTPException(status_code=404, detail={"error": "entry not found"})
        return {"entry": _present(entry), **_day_payload(identity["id"], entry["day"])}

    @app.delete("/diet/log/{entry_id}")
    def diet_delete(entry_id: int, date: str = "", identity: dict = Depends(current_user)):
        entry = diet.get_entry(identity["id"], entry_id)
        if entry is None or not diet.delete_entry(identity["id"], entry_id):
            raise HTTPException(status_code=404, detail={"error": "entry not found"})
        # Deleting a meal deletes its photo too (Undo restores the entry without it).
        if photo_store and (entry.get("image_url") or "").startswith(KEY_PREFIX):
            try:
                photo_store.delete(entry["image_url"])
            except Exception:
                pass  # the entry is gone either way; an orphaned private object is harmless
        return {"ok": True, **_day_payload(identity["id"], entry["day"])}

    @app.get("/diet/history")
    def diet_history(days: int = 7, end: str = "", identity: dict = Depends(current_user)):
        """Per-day totals for the `days` days ending at `end` (inclusive), oldest first.
        Days with nothing logged are included with zero totals."""
        days = max(1, min(days, 90))
        try:
            end_d = Date.fromisoformat(end or _today())
        except ValueError:
            raise HTTPException(status_code=422, detail={"error": "bad end date"})
        dates = [(end_d - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
        by_day: dict[str, list[dict]] = {d: [] for d in dates}
        for e in diet.range_entries(identity["id"], dates[0], dates[-1]):
            by_day.setdefault(e["day"], []).append(e)
        targets = compute_targets(diet.get_profile(identity["id"]))
        return {"targets": targets, "days": [
            {"date": d, "count": len(by_day[d]),
             "totals": {k: sum(float(e[k]) for e in by_day[d] if e.get(k) is not None) for k in MACRO_KEYS},
             "partial": [k for k in OPTIONAL_KEYS if any(e.get(k) is None for e in by_day[d])]}
            for d in dates]}

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
        photo_store=PhotoStore.from_settings(settings),
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
