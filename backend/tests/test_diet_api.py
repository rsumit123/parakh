import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.db import make_engine, make_session_factory, init_db
from app.repositories.products import ProductRepository
from app.scoring.scorer import score as score_fn


class _OFF:
    def fetch(self, barcode): return None


class _Extractor:
    def extract(self, b): raise RuntimeError("unused")


class _Estimator:
    def estimate(self, image_bytes):
        return {"items": [
            {"name": "Dal Tadka", "portion_g": 200.0,
             "per100g": {"energy_kj": 480, "sugars_g": 1, "sat_fat_g": 2, "salt_g": 0.5,
                         "fibre_g": 8, "protein_g": 9}},
            {"name": "Jeera Rice", "portion_g": 250.0,
             "per100g": {"energy_kj": 540, "sugars_g": 0, "sat_fat_g": 1, "salt_g": 0.3,
                         "fibre_g": 2, "protein_g": 4}},
        ]}


@pytest.fixture
def client_and_sf():
    engine = make_engine("sqlite://")
    sf = make_session_factory(engine)
    init_db(engine)
    repo = ProductRepository(sf)
    nutrition = {"energy_kj": 360, "sugars_g": 14.5, "sat_fat_g": 1.25, "salt_g": 0.075,
                 "fibre_g": 0, "protein_g": 2.1, "fruit_veg_nuts_pct": 0}
    repo.save(barcode="b1", name="Amul Lassi", brand="Amul", category="dairy",
              ingredients=["milk"], nutrition=nutrition,
              score=score_fn(["milk"], nutrition, "dairy"), source="amazon")
    app = create_app(session_factory=sf, off_client=_OFF(), label_extractor=_Extractor(),
                     meal_estimator=_Estimator(), secret="s", guest_limit=3, free_limit=10,
                     today="2026-06-13")
    return TestClient(app), sf


def _guest_token(c):
    return c.post("/auth/guest", json={"device_id": "d1"}).json()["token"]


def _user_headers(secret="s"):
    import hmac, hashlib
    payload = "user:1"
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return {"Authorization": f"Bearer {payload}.{sig}"}


def test_diet_requires_signed_in_user(client_and_sf):
    c, _ = client_and_sf
    g = _guest_token(c)
    r = c.get("/diet/day", headers={"Authorization": f"Bearer {g}"})
    assert r.status_code == 401


def test_log_packaged_computes_macros_from_product(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    r = c.post("/diet/log", headers=h, json={"kind": "packaged", "barcode": "b1",
               "name": "Amul Lassi", "brand": "Amul", "quantity_g": 200})
    assert r.status_code == 200
    body = r.json()
    assert round(body["entry"]["sugars_g"], 1) == 29.0
    assert body["totals"]["sugars_g"] == body["entry"]["sugars_g"]
    assert body["status"]["sugars_g"] in ("ok", "over")
    assert "headline" in body


def test_estimate_returns_items(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    r = c.post("/diet/estimate", headers=h,
               files={"image": ("m.jpg", b"jpegbytes", "image/jpeg")})
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 2
    assert items[0]["name"] == "Dal Tadka" and items[1]["portion_g"] == 250.0
    assert items[0]["per100g"]["protein_g"] == 9


def test_log_unpackaged_uses_supplied_per100g_then_day_and_delete(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    per = {"energy_kj": 500, "sugars_g": 2, "sat_fat_g": 1, "salt_g": 0.3, "fibre_g": 2, "protein_g": 4}
    r = c.post("/diet/log", headers=h, json={"kind": "unpackaged", "name": "Dal rice",
               "quantity_g": 350, "per100g": per})
    eid = r.json()["entry"]["id"]
    assert round(r.json()["entry"]["protein_g"], 1) == 14.0
    day = c.get("/diet/day?date=2026-06-13", headers=h).json()
    assert len(day["entries"]) == 1 and day["targets"]["protein_g"] == 50.0
    d = c.delete(f"/diet/log/{eid}", headers=h)
    assert d.status_code == 200 and d.json()["totals"]["protein_g"] == 0


def test_profile_get_then_override_changes_targets(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    r0 = c.get("/diet/profile", headers=h).json()
    assert r0["effective_targets"]["protein_g"] == 50.0
    c.put("/diet/profile", headers=h, json={"target_overrides": {"protein_g": 90}})
    r1 = c.get("/diet/profile", headers=h).json()
    assert r1["effective_targets"]["protein_g"] == 90.0
    assert c.get("/diet/day?date=2026-06-13", headers=h).json()["targets"]["protein_g"] == 90.0


_PER = {"energy_kj": 500, "sugars_g": 2, "sat_fat_g": 1, "salt_g": 0.3, "fibre_g": 2, "protein_g": 4}


def _log(c, h, **kw):
    body = {"kind": "unpackaged", "name": "Dal rice", "quantity_g": 200, "per100g": _PER, **kw}
    return c.post("/diet/log", headers=h, json=body).json()["entry"]


def test_patch_quantity_rescales_macros_and_renames(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    e = _log(c, h)
    r = c.patch(f"/diet/log/{e['id']}", headers=h, json={"name": "Dal chawal", "quantity_g": 300})
    assert r.status_code == 200
    got = r.json()["entry"]
    assert got["name"] == "Dal chawal" and got["quantity_g"] == 300
    assert round(got["protein_g"], 1) == 12.0  # 4 g/100 g x 300 g
    assert r.json()["date"] == "2026-06-13" and round(r.json()["totals"]["protein_g"], 1) == 12.0


def test_patch_explicit_macros_override(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    e = _log(c, h)
    macros = {"energy_kj": 1000, "sugars_g": 5, "sat_fat_g": 3, "salt_g": 1, "fibre_g": 4, "protein_g": 20}
    got = c.patch(f"/diet/log/{e['id']}", headers=h,
                  json={"quantity_g": 250, "macros": macros}).json()["entry"]
    assert got["protein_g"] == 20 and got["quantity_g"] == 250


def test_patch_other_users_entry_is_404(client_and_sf):
    c, _ = client_and_sf
    e = _log(c, _user_headers())
    import hmac, hashlib
    sig = hmac.new(b"s", b"user:2", hashlib.sha256).hexdigest()
    r = c.patch(f"/diet/log/{e['id']}", headers={"Authorization": f"Bearer user:2.{sig}"},
                json={"name": "x"})
    assert r.status_code == 404


def test_past_day_log_edit_and_delete_return_that_day(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    e = _log(c, h, day="2026-06-10")
    assert e["day"] == "2026-06-10"
    r = c.patch(f"/diet/log/{e['id']}", headers=h, json={"quantity_g": 100})
    assert r.json()["date"] == "2026-06-10"
    d = c.delete(f"/diet/log/{e['id']}", headers=h)  # no ?date: uses the entry's own day
    assert d.json()["date"] == "2026-06-10" and d.json()["entries"] == []


def test_history_returns_daily_totals_including_empty_days(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    _log(c, h, day="2026-06-13")
    _log(c, h, day="2026-06-13")
    _log(c, h, day="2026-06-11")
    r = c.get("/diet/history?days=3&end=2026-06-13", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert [d["date"] for d in body["days"]] == ["2026-06-11", "2026-06-12", "2026-06-13"]
    assert [d["count"] for d in body["days"]] == [1, 0, 2]
    assert round(body["days"][2]["totals"]["protein_g"], 1) == 16.0
    assert body["targets"]["protein_g"] == 50.0


def test_meal_slot_logged_edited_and_validated(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    e = _log(c, h, meal="lunch")
    assert e["meal"] == "lunch" and e["created_at"]
    got = c.patch(f"/diet/log/{e['id']}", headers=h, json={"meal": "dinner"}).json()["entry"]
    assert got["meal"] == "dinner"
    bad = c.post("/diet/log", headers=h, json={"kind": "manual", "name": "x", "quantity_g": 1,
                                                "per100g": _PER, "meal": "brunch"})
    assert bad.status_code == 422
    assert _log(c, h)["meal"] is None  # optional: client infers from time


def test_recent_foods_dedupes_and_counts(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    _log(c, h, name="Poha", quantity_g=150, day="2026-06-11")
    _log(c, h, name="poha ", quantity_g=200, day="2026-06-12")   # same food, newer amount
    _log(c, h, name="Dal rice", day="2026-06-12")
    c.post("/diet/log", headers=h, json={"kind": "packaged", "barcode": "b1", "name": "Amul Lassi",
                                         "brand": "Amul", "quantity_g": 200})
    items = c.get("/diet/recent", headers=h).json()["items"]
    names = [i["name"] for i in items]
    assert names[0] == "Amul Lassi"                      # most recent first
    assert sorted(names) == ["Amul Lassi", "Dal rice", "poha "]
    poha = next(i for i in items if i["name"].strip().lower() == "poha")
    assert poha["uses"] == 2 and poha["quantity_g"] == 200
    assert round(poha["per100g"]["protein_g"], 2) == 4.0  # back to per-100 g
    lassi = next(i for i in items if i["name"] == "Amul Lassi")
    assert lassi["kind"] == "packaged" and lassi["barcode"] == "b1"


def test_profile_personalises_targets_and_day_flag(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    assert c.get("/diet/day?date=2026-06-13", headers=h).json()["personalised"] is False
    prof = {"sex": "male", "age": 30, "weight_kg": 70, "height_cm": 175,
            "activity": "moderate", "goal": "maintain"}
    r = c.put("/diet/profile", headers=h, json={**prof, "target_overrides": {}}).json()
    assert r["profile"]["height_cm"] == 175
    assert round(r["effective_targets"]["energy_kj"] / 4.184) == 2556
    assert r["computed_targets"]["protein_g"] == 58
    day = c.get("/diet/day?date=2026-06-13", headers=h).json()
    assert day["personalised"] is True and day["targets"]["protein_g"] == 58
    # an explicit override sits on top; clearing overrides goes back to computed
    c.put("/diet/profile", headers=h, json={"target_overrides": {"protein_g": 90}})
    assert c.get("/diet/profile", headers=h).json()["effective_targets"]["protein_g"] == 90
    c.put("/diet/profile", headers=h, json={"target_overrides": {}})
    assert c.get("/diet/profile", headers=h).json()["effective_targets"]["protein_g"] == 58


def test_profile_rejects_bad_values(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    assert c.put("/diet/profile", headers=h, json={"sex": "x"}).status_code == 422
    assert c.put("/diet/profile", headers=h, json={"age": 5}).status_code == 422
    assert c.put("/diet/profile", headers=h, json={"activity": "extreme"}).status_code == 422


# ---- meal photos -------------------------------------------------------------

class _FakeS3:
    def __init__(self): self.objects, self.deleted = {}, []
    def copy_object(self, Bucket, Key, CopySource, **kw): self.objects[Key] = self.objects[CopySource["Key"]]
    def put_object(self, Bucket, Key, Body, **kw): self.objects[Key] = Body
    def generate_presigned_url(self, op, Params, ExpiresIn): return f"https://signed/{Params['Key']}?exp={ExpiresIn}"
    def delete_object(self, Bucket, Key): self.deleted.append(Key); self.objects.pop(Key, None)


def _jpeg_with_gps() -> bytes:
    import io
    from PIL import Image
    img = Image.new("RGB", (3000, 2000), (200, 150, 50))
    exif = Image.Exif()
    exif[0x8825] = {1: "N", 2: (12.0, 58.0, 0.0)}   # GPSInfo: a latitude
    out = io.BytesIO(); img.save(out, format="JPEG", exif=exif.tobytes()); return out.getvalue()


@pytest.fixture
def photo_client():
    from app.services.photos import PhotoStore
    engine = make_engine("sqlite://"); sf = make_session_factory(engine); init_db(engine)
    s3 = _FakeS3()
    app = create_app(session_factory=sf, off_client=_OFF(), label_extractor=_Extractor(),
                     meal_estimator=_Estimator(), secret="s", guest_limit=3, free_limit=10,
                     today="2026-06-13", photo_store=PhotoStore(s3, "bucket"))
    return TestClient(app), s3


def test_photo_upload_is_resized_stripped_and_private(photo_client):
    import io
    from PIL import Image
    c, s3 = photo_client
    r = c.post("/diet/photo", headers=_user_headers(), files={"image": ("m.jpg", _jpeg_with_gps(), "image/jpeg")})
    assert r.status_code == 200
    key = r.json()["photo_key"]
    assert key.startswith("meals/user-1/") and key.endswith(".jpg")
    assert r.json()["url"].startswith("https://signed/" + key)
    stored = Image.open(io.BytesIO(s3.objects[key]))
    assert max(stored.size) == 1280                 # downscaled
    assert 0x8825 not in stored.getexif()           # GPS gone
    bad = c.post("/diet/photo", headers=_user_headers(), files={"image": ("x.jpg", b"not an image", "image/jpeg")})
    assert bad.status_code == 422


def test_log_with_photo_shows_signed_url_and_delete_removes_photo(photo_client):
    c, s3 = photo_client
    h = _user_headers()
    key = c.post("/diet/photo", headers=h, files={"image": ("m.jpg", _jpeg_with_gps(), "image/jpeg")}).json()["photo_key"]
    r = c.post("/diet/log", headers=h, json={"kind": "unpackaged", "name": "Thali", "quantity_g": 300,
                                              "per100g": _PER, "photo_key": key}).json()
    assert r["entry"]["image_url"].startswith("https://signed/" + key)
    day = c.get("/diet/day?date=2026-06-13", headers=h).json()
    assert day["entries"][0]["image_url"].startswith("https://signed/")
    c.delete(f"/diet/log/{r['entry']['id']}", headers=h)
    assert s3.deleted == [key]


def test_cannot_attach_someone_elses_photo(photo_client):
    c, _ = photo_client
    r = c.post("/diet/log", headers=_user_headers(), json={"kind": "manual", "name": "x", "quantity_g": 1,
               "per100g": _PER, "photo_key": "meals/user-2/abc.jpg"})
    assert r.status_code == 422
    r = c.post("/diet/log", headers=_user_headers(), json={"kind": "manual", "name": "x", "quantity_g": 1,
               "per100g": _PER, "photo_key": "meals/user-1/../user-2/abc.jpg"})
    assert r.status_code == 422


def test_photo_endpoint_off_without_bucket(client_and_sf):
    c, _ = client_and_sf
    r = c.post("/diet/photo", headers=_user_headers(), files={"image": ("m.jpg", b"x", "image/jpeg")})
    assert r.status_code == 503


def test_carbs_and_fat_logged_unknown_and_rescaled(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    with_cf = _log(c, h, per100g={**_PER, "carbs_g": 20, "fat_g": 5})
    assert with_cf["carbs_g"] == 40 and with_cf["fat_g"] == 10            # 200 g
    without = _log(c, h)                                                  # old-style per100g
    assert without["carbs_g"] is None and without["fat_g"] is None
    edited = c.patch(f"/diet/log/{with_cf['id']}", headers=h, json={"quantity_g": 100}).json()["entry"]
    assert edited["carbs_g"] == 20
    edited = c.patch(f"/diet/log/{without['id']}", headers=h, json={"quantity_g": 100}).json()["entry"]
    assert edited["carbs_g"] is None                                      # unknown stays unknown
    day = c.get("/diet/day?date=2026-06-13", headers=h).json()
    assert day["totals"]["carbs_g"] == 20 and day["partial"] == ["carbs_g", "fat_g"]
    assert day["targets"]["carbs_g"] == 250.0
    hist = c.get("/diet/history?days=1&end=2026-06-13", headers=h).json()["days"][0]
    assert hist["totals"]["carbs_g"] == 20 and hist["partial"] == ["carbs_g", "fat_g"]
    items = {i["name"]: i for i in c.get("/diet/recent", headers=h).json()["items"]}
    assert items["Dal rice"]["per100g"]["carbs_g"] in (None, 20.0)


def test_edit_can_set_carbs_explicitly(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    e = _log(c, h)
    m = {**{k: 1 for k in _PER}, "carbs_g": 55, "fat_g": None}
    got = c.patch(f"/diet/log/{e['id']}", headers=h, json={"macros": m}).json()["entry"]
    assert got["carbs_g"] == 55 and got["fat_g"] is None


def test_edit_from_older_app_keeps_carbs(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    e = _log(c, h, per100g={**_PER, "carbs_g": 20, "fat_g": 5})
    got = c.patch(f"/diet/log/{e['id']}", headers=h, json={"macros": _PER}).json()["entry"]  # no carbs key
    assert got["carbs_g"] == 40 and got["protein_g"] == 4


# ---- repeat-meal suggestions --------------------------------------------------

def _meal(c, h, day, meal, *names):
    return [_log(c, h, name=n, day=day, meal=meal) for n in names]


def test_suggestions_rank_usual_meals_per_slot(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    for d in ("2026-06-10", "2026-06-11", "2026-06-12"):
        _meal(c, h, d, "breakfast", "Roti, Dal", "Boiled eggs ×2")
    _meal(c, h, "2026-06-12", "lunch", "Rice, Dal")
    _meal(c, h, "2026-06-11", "lunch", "Rajma Chawal")
    _meal(c, h, "2026-06-13", "breakfast", "Poha")            # the day being viewed: excluded
    r = c.get("/diet/suggestions?date=2026-06-13", headers=h).json()["slots"]
    b = r["breakfast"]
    assert b[0]["times"] == 3 and b[0]["source_day"] == "2026-06-12"
    assert [i["name"] for i in b[0]["items"]] == ["Roti, Dal", "Boiled eggs ×2"]
    assert b[0]["kcal"] == round(2 * 500 * 2 / 4.184)           # two 200 g items at 500 kJ/100 g
    assert [s["items"][0]["name"] for s in r["lunch"]] == ["Rice, Dal", "Rajma Chawal"]  # tie -> newest first
    assert r["dinner"] == [] and r["snack"] == []


def test_suggestions_ignore_old_and_other_users_meals(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    _meal(c, h, "2026-05-01", "lunch", "Old meal")             # > 14 days before
    import hmac, hashlib
    sig = hmac.new(b"s", b"user:2", hashlib.sha256).hexdigest()
    _meal(c, {"Authorization": f"Bearer user:2.{sig}"}, "2026-06-12", "lunch", "Not mine")
    assert c.get("/diet/suggestions?date=2026-06-13", headers=h).json()["slots"]["lunch"] == []


def test_repeat_copies_a_meal_into_the_viewed_day(client_and_sf):
    c, _ = client_and_sf
    h = _user_headers()
    src = _meal(c, h, "2026-06-12", "breakfast", "Roti, Dal", "Boiled eggs ×2")
    _meal(c, h, "2026-06-13", "lunch", "Already logged")       # the target day isn't empty
    r = c.post("/diet/repeat", headers=h, json={"entry_ids": [e["id"] for e in src],
                                                 "day": "2026-06-13", "meal": "breakfast"})
    assert r.status_code == 200
    body = r.json()
    assert [e["name"] for e in body["created"]] == ["Roti, Dal", "Boiled eggs ×2"]   # only the copies
    assert all(e["day"] == "2026-06-13" and e["meal"] == "breakfast" for e in body["created"])
    assert len(body["entries"]) == 3                                                  # the whole day
    assert body["date"] == "2026-06-13" and round(body["totals"]["protein_g"]) == 24
    assert len(c.get("/diet/day?date=2026-06-12", headers=h).json()["entries"]) == 2   # source untouched


def test_repeat_rejects_someone_elses_entries(client_and_sf):
    c, _ = client_and_sf
    e = _log(c, _user_headers())
    import hmac, hashlib
    sig = hmac.new(b"s", b"user:2", hashlib.sha256).hexdigest()
    r = c.post("/diet/repeat", headers={"Authorization": f"Bearer user:2.{sig}"},
               json={"entry_ids": [e["id"]], "day": "2026-06-13", "meal": "lunch"})
    assert r.status_code == 404


def test_repeat_copies_the_photo(photo_client):
    c, s3 = photo_client
    h = _user_headers()
    key = c.post("/diet/photo", headers=h, files={"image": ("m.jpg", _jpeg_with_gps(), "image/jpeg")}).json()["photo_key"]
    e = c.post("/diet/log", headers=h, json={"kind": "unpackaged", "name": "Thali", "quantity_g": 300,
                                              "per100g": _PER, "photo_key": key, "day": "2026-06-12",
                                              "meal": "lunch"}).json()["entry"]
    new = c.post("/diet/repeat", headers=h, json={"entry_ids": [e["id"]], "day": "2026-06-13",
                                                   "meal": "lunch"}).json()["created"][0]
    assert new["image_url"].startswith("https://signed/meals/user-1/") and key not in new["image_url"]
    assert len(s3.objects) == 2                       # deleting one entry won't break the other
