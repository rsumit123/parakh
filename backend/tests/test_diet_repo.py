from app.db import make_engine, make_session_factory, init_db
from app.repositories.diet import DietRepository


def _repo():
    e = make_engine("sqlite://")
    init_db(e)
    return DietRepository(make_session_factory(e))


def _macros(**kw):
    base = {"energy_kj": 0, "sugars_g": 0, "sat_fat_g": 0, "salt_g": 0, "fibre_g": 0, "protein_g": 0}
    base.update(kw)
    return base


def test_add_and_list_day_scoped_by_user_and_day():
    r = _repo()
    e = r.add_entry(identity="user:1", day="2026-06-13", kind="packaged", name="Lassi",
                    brand="Amul", quantity_g=200, macros=_macros(sugars_g=29), barcode="b1")
    assert e["id"] > 0 and e["sugars_g"] == 29 and e["name"] == "Lassi"
    r.add_entry(identity="user:1", day="2026-06-12", kind="manual", name="Old", brand="",
                quantity_g=100, macros=_macros(sugars_g=5))
    r.add_entry(identity="user:2", day="2026-06-13", kind="manual", name="Other", brand="",
                quantity_g=100, macros=_macros(sugars_g=9))
    today = r.day_entries("user:1", "2026-06-13")
    assert [x["name"] for x in today] == ["Lassi"]   # only user:1's today


def test_delete_only_own_entry():
    r = _repo()
    e = r.add_entry(identity="user:1", day="2026-06-13", kind="manual", name="X", brand="",
                    quantity_g=100, macros=_macros())
    assert r.delete_entry("user:2", e["id"]) is False   # not the owner
    assert r.day_entries("user:1", "2026-06-13")
    assert r.delete_entry("user:1", e["id"]) is True
    assert r.day_entries("user:1", "2026-06-13") == []


def test_profile_defaults_empty_then_upsert():
    r = _repo()
    assert r.get_profile("user:1") == {"sex": None, "age": None, "weight_kg": None,
                                       "activity": None, "goal": None, "target_overrides": {}}
    r.upsert_profile("user:1", {"sex": "m", "target_overrides": {"protein_g": 80}})
    p = r.get_profile("user:1")
    assert p["sex"] == "m" and p["target_overrides"] == {"protein_g": 80}
    r.upsert_profile("user:1", {"target_overrides": {"protein_g": 90}})  # partial update
    assert r.get_profile("user:1")["sex"] == "m"  # unchanged
    assert r.get_profile("user:1")["target_overrides"] == {"protein_g": 90}
