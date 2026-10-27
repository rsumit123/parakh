from sqlalchemy import select
from app.models import FoodLogEntry, Profile
from app.nutrition.targets import MACRO_KEYS, OPTIONAL_KEYS


def _num(k: str, v) -> float | None:
    """Core macros default to 0; optional ones (carbs, fat) stay None when unknown."""
    if v is None or v == "":
        return None if k in OPTIONAL_KEYS else 0.0
    return float(v)

_PROFILE_FIELDS = ("sex", "age", "weight_kg", "height_cm", "activity", "goal")


class DietRepository:
    """Food-log CRUD + per-user profile. All reads/writes are user-scoped by caller."""

    def __init__(self, session_factory):
        self._Session = session_factory

    def _entry_dict(self, e: FoodLogEntry) -> dict:
        return {
            "id": e.id, "day": e.day, "kind": e.kind, "barcode": e.barcode,
            "name": e.name, "brand": e.brand, "quantity_g": e.quantity_g,
            "image_url": e.image_url, "meal": e.meal,
            # UTC, so the client can place un-slotted (older) entries by local time
            "created_at": e.created_at.isoformat() + "Z" if e.created_at else None,
            **{k: getattr(e, k) for k in MACRO_KEYS},
        }

    def add_entry(self, *, identity: str, day: str, kind: str, name: str, brand: str,
                  quantity_g: float, macros: dict, barcode: str | None = None,
                  image_url: str = "", meal: str | None = None) -> dict:
        with self._Session() as s:
            e = FoodLogEntry(
                identity=identity, day=day, kind=kind, name=name, brand=brand,
                quantity_g=float(quantity_g), barcode=barcode, image_url=image_url, meal=meal,
                **{k: _num(k, macros.get(k)) for k in MACRO_KEYS},
            )
            s.add(e)
            s.commit()
            s.refresh(e)
            return self._entry_dict(e)

    def day_entries(self, identity: str, day: str) -> list[dict]:
        with self._Session() as s:
            rows = s.scalars(
                select(FoodLogEntry)
                .where(FoodLogEntry.identity == identity, FoodLogEntry.day == day)
                .order_by(FoodLogEntry.created_at)
            ).all()
            return [self._entry_dict(e) for e in rows]

    def range_entries(self, identity: str, start: str, end: str) -> list[dict]:
        """Entries with start <= day <= end (ISO dates compare correctly as strings)."""
        with self._Session() as s:
            rows = s.scalars(
                select(FoodLogEntry)
                .where(FoodLogEntry.identity == identity,
                       FoodLogEntry.day >= start, FoodLogEntry.day <= end)
            ).all()
            return [self._entry_dict(e) for e in rows]

    def recent_foods(self, identity: str, limit: int = 20, scan: int = 300) -> list[dict]:
        """Distinct foods from the user's latest `scan` entries, newest first. Same food =
        same barcode, else same name (case/space-insensitive). Each carries its latest
        amount, per-100 g macros (so it can be re-logged at any amount) and use count."""
        with self._Session() as s:
            rows = s.scalars(
                select(FoodLogEntry).where(FoodLogEntry.identity == identity)
                .order_by(FoodLogEntry.created_at.desc(), FoodLogEntry.id.desc()).limit(scan)
            ).all()
        seen: dict[str, dict] = {}
        for e in rows:
            key = f"b:{e.barcode}" if e.barcode else f"n:{' '.join(e.name.lower().split())}"
            if key in seen:
                seen[key]["uses"] += 1
                continue
            q = e.quantity_g or 0
            seen[key] = {
                "name": e.name, "brand": e.brand, "kind": e.kind, "barcode": e.barcode,
                "quantity_g": q, "meal": e.meal, "last_day": e.day, "uses": 1,
                "per100g": {k: (None if getattr(e, k) is None else (getattr(e, k) * 100 / q if q else 0.0))
                            for k in MACRO_KEYS},
            }
        return list(seen.values())[:limit]

    def get_entry(self, identity: str, entry_id: int) -> dict | None:
        with self._Session() as s:
            e = s.get(FoodLogEntry, entry_id)
            if e is None or e.identity != identity:
                return None
            return self._entry_dict(e)

    def update_entry(self, identity: str, entry_id: int, *, name: str | None = None,
                     quantity_g: float | None = None, macros: dict | None = None,
                     meal: str | None = None) -> dict | None:
        """Edit an entry. A new quantity without explicit macros rescales the stored
        macros proportionally (entries keep absolute amounts, not per-100 g)."""
        with self._Session() as s:
            e = s.get(FoodLogEntry, entry_id)
            if e is None or e.identity != identity:
                return None
            if name is not None:
                e.name = name
            if meal is not None:
                e.meal = meal
            if quantity_g is not None:
                new_q = float(quantity_g)
                if macros is None and e.quantity_g > 0:
                    factor = new_q / e.quantity_g
                    for k in MACRO_KEYS:
                        if getattr(e, k) is not None:
                            setattr(e, k, getattr(e, k) * factor)
                e.quantity_g = new_q
            if macros is not None:
                for k in MACRO_KEYS:
                    if k in OPTIONAL_KEYS and k not in macros:
                        continue  # older clients don't send carbs/fat: keep what's stored
                    setattr(e, k, _num(k, macros.get(k)))
            s.commit()
            s.refresh(e)
            return self._entry_dict(e)

    def delete_entry(self, identity: str, entry_id: int) -> bool:
        with self._Session() as s:
            e = s.get(FoodLogEntry, entry_id)
            if e is None or e.identity != identity:
                return False
            s.delete(e)
            s.commit()
            return True

    def get_profile(self, identity: str) -> dict:
        with self._Session() as s:
            p = s.get(Profile, identity)
            if p is None:
                return {**{f: None for f in _PROFILE_FIELDS}, "target_overrides": {}}
            return {**{f: getattr(p, f) for f in _PROFILE_FIELDS},
                    "target_overrides": p.target_overrides or {}}

    def upsert_profile(self, identity: str, fields: dict) -> dict:
        with self._Session() as s:
            p = s.get(Profile, identity)
            if p is None:
                p = Profile(identity=identity)
                s.add(p)
            for f in _PROFILE_FIELDS:
                if f in fields:
                    setattr(p, f, fields[f])
            if fields.get("target_overrides") is not None:
                p.target_overrides = fields["target_overrides"]
            s.commit()
        return self.get_profile(identity)
