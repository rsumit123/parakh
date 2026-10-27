from sqlalchemy import select
from app.models import FoodLogEntry, Profile
from app.nutrition.targets import MACRO_KEYS

_PROFILE_FIELDS = ("sex", "age", "weight_kg", "activity", "goal")


class DietRepository:
    """Food-log CRUD + per-user profile. All reads/writes are user-scoped by caller."""

    def __init__(self, session_factory):
        self._Session = session_factory

    def _entry_dict(self, e: FoodLogEntry) -> dict:
        return {
            "id": e.id, "day": e.day, "kind": e.kind, "barcode": e.barcode,
            "name": e.name, "brand": e.brand, "quantity_g": e.quantity_g,
            "image_url": e.image_url,
            **{k: getattr(e, k) for k in MACRO_KEYS},
        }

    def add_entry(self, *, identity: str, day: str, kind: str, name: str, brand: str,
                  quantity_g: float, macros: dict, barcode: str | None = None,
                  image_url: str = "") -> dict:
        with self._Session() as s:
            e = FoodLogEntry(
                identity=identity, day=day, kind=kind, name=name, brand=brand,
                quantity_g=float(quantity_g), barcode=barcode, image_url=image_url,
                **{k: float(macros.get(k, 0) or 0) for k in MACRO_KEYS},
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

    def get_entry(self, identity: str, entry_id: int) -> dict | None:
        with self._Session() as s:
            e = s.get(FoodLogEntry, entry_id)
            if e is None or e.identity != identity:
                return None
            return self._entry_dict(e)

    def update_entry(self, identity: str, entry_id: int, *, name: str | None = None,
                     quantity_g: float | None = None, macros: dict | None = None) -> dict | None:
        """Edit an entry. A new quantity without explicit macros rescales the stored
        macros proportionally (entries keep absolute amounts, not per-100 g)."""
        with self._Session() as s:
            e = s.get(FoodLogEntry, entry_id)
            if e is None or e.identity != identity:
                return None
            if name is not None:
                e.name = name
            if quantity_g is not None:
                new_q = float(quantity_g)
                if macros is None and e.quantity_g > 0:
                    factor = new_q / e.quantity_g
                    for k in MACRO_KEYS:
                        setattr(e, k, getattr(e, k) * factor)
                e.quantity_g = new_q
            if macros is not None:
                for k in MACRO_KEYS:
                    setattr(e, k, float(macros.get(k, 0) or 0))
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
