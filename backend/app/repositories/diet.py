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
