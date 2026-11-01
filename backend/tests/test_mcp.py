"""The Claude connector end to end: secret URL -> MCP JSON-RPC -> the user's diary."""
import json

import pytest
from fastapi.testclient import TestClient

from app.connector import issue_token
from app.db import make_engine, make_session_factory, init_db
from app.main import create_app
from app.repositories.diet import DietRepository
from tests.test_diet_api import _OFF, _Extractor, _user_headers

HDRS = {"accept": "application/json, text/event-stream", "content-type": "application/json"}


@pytest.fixture
def env():
    engine = make_engine("sqlite://")
    sf = make_session_factory(engine)
    init_db(engine)
    app = create_app(session_factory=sf, off_client=_OFF(), label_extractor=_Extractor(),
                     secret="s", guest_limit=3, free_limit=10, today="2026-06-13")
    with TestClient(app) as c:   # runs the lifespan that starts the MCP session manager
        yield c, sf


def _rpc(c, token, method, params=None, id_=1):
    r = c.post(f"/mcp/{token}/mcp", headers=HDRS,
               json={"jsonrpc": "2.0", "id": id_, "method": method, "params": params or {}})
    assert r.status_code == 200, r.text
    body = r.text
    if r.headers["content-type"].startswith("text/event-stream"):
        body = next(line[5:] for line in body.splitlines() if line.startswith("data:"))
    return json.loads(body)


def _call(c, token, tool, **args):
    res = _rpc(c, token, "tools/call", {"name": tool, "arguments": args})["result"]
    text = "\n".join(x["text"] for x in res["content"] if x["type"] == "text")
    return text, res.get("isError", False)


def test_unknown_secret_is_404_and_get_is_405(env):
    c, sf = env
    assert c.post("/mcp/nope/mcp", headers=HDRS, json={}).status_code == 404
    tok = issue_token(sf, "user:1")
    assert c.get(f"/mcp/{tok}/mcp").status_code == 405


def test_lists_the_diary_tools(env):
    c, sf = env
    tok = issue_token(sf, "user:1")
    init = _rpc(c, tok, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                       "clientInfo": {"name": "t", "version": "1"}})
    assert init["result"]["serverInfo"]["name"] == "Parakh"
    names = {t["name"] for t in _rpc(c, tok, "tools/list")["result"]["tools"]}
    assert {"get_day", "get_summary", "search_foods", "log_food", "log_meal", "edit_entry",
            "delete_entry", "log_weight", "get_profile_targets", "get_frequent_foods", "get_weight"} <= names


def test_log_edit_and_delete_through_the_connector(env):
    c, sf = env
    tok = issue_token(sf, "user:1")
    found, _ = _call(c, tok, "search_foods", query="chapati")
    assert found.startswith("roti: Roti · one piece 40 g")
    text, err = _call(c, tok, "log_meal", meal="dinner", name="Roti, Dal & Eggs", dishes=[
        {"food_id": "roti", "count": 4}, {"food_id": "dal_tadka", "grams": 150},
        {"food_id": "boiled_egg", "count": 2}])
    assert not err and "Logged 3 dishes on 2026-06-13 (dinner) as 'Roti, Dal & Eggs'" in text
    entries = DietRepository(sf).day_entries("user:1", "2026-06-13")
    assert [e["name"] for e in entries] == ["Roti ×4", "Dal Tadka", "Boiled Egg ×2"]
    assert len({e["group_id"] for e in entries}) == 1
    assert round(entries[0]["energy_kj"] / 4.184) == 422          # 4 x 40 g roti
    # the app sees the same diary through its own API
    day = c.get("/diet/day?date=2026-06-13", headers=_user_headers()).json()
    assert len(day["entries"]) == 3
    # fix the roti count: grams and nutrients follow
    text, _ = _call(c, tok, "edit_entry", entry_id=entries[0]["id"], count=3)
    roti = DietRepository(sf).get_entry("user:1", entries[0]["id"])
    assert roti["name"] == "Roti ×3" and roti["quantity_g"] == 120 and round(roti["energy_kj"] / 4.184) == 317
    # custom food, then delete it
    text, err = _call(c, tok, "log_food", meal="snack", name="Masala Chai (1 cup)", grams=150,
                      nutrition_per_100g={"energy_kcal": 47, "protein_g": 1.6, "sugars_g": 6.4, "sat_fat_g": 1.1})
    assert not err and "Masala Chai (1 cup) — 150 g · 70 kcal" in text
    chai = DietRepository(sf).day_entries("user:1", "2026-06-13")[-1]
    text, _ = _call(c, tok, "delete_entry", entry_id=chai["id"])
    assert text.startswith("Deleted from 2026-06-13 (snack)")


def test_summary_and_targets(env):
    c, sf = env
    tok = issue_token(sf, "user:1")
    _call(c, tok, "log_food", meal="lunch", food_id="dal_tadka", grams=200, date="2026-06-12")
    _call(c, tok, "log_food", meal="lunch", food_id="paneer_sabzi", grams=150)
    text, _ = _call(c, tok, "get_summary", days=7)
    assert "2026-06-07 to 2026-06-13: 2 of 7 days logged." in text
    assert "2026-06-11: nothing logged" in text and "satfat 1/2 days" not in text
    text, _ = _call(c, tok, "get_profile_targets")
    assert "Targets basis: default" in text
    _call(c, tok, "log_weight", weight_kg=67.4)
    assert "67.4 kg" in _call(c, tok, "get_weight")[0]


def test_each_secret_sees_only_its_own_diary(env):
    c, sf = env
    a, b = issue_token(sf, "user:1"), issue_token(sf, "user:2")
    _call(c, a, "log_food", meal="lunch", food_id="idli", count=2)
    assert "0 entries" in _call(c, b, "get_day")[0]
    entry = DietRepository(sf).day_entries("user:1", "2026-06-13")[0]
    assert "not found" in _call(c, b, "delete_entry", entry_id=entry["id"])[0]
    assert len(DietRepository(sf).day_entries("user:1", "2026-06-13")) == 1
    # re-issuing a secret retires the old URL
    issue_token(sf, "user:1")
    assert c.post(f"/mcp/{a}/mcp", headers=HDRS, json={}).status_code == 404


def test_bad_input_is_a_tool_error_not_a_crash(env):
    c, sf = env
    tok = issue_token(sf, "user:1")
    text, err = _call(c, tok, "log_food", meal="brunch", food_id="roti", count=2)
    assert err and "meal must be one of" in text
    text, err = _call(c, tok, "log_food", meal="lunch", food_id="pizza")
    assert err and "unknown food_id" in text


def test_access_log_hides_the_secret():
    import logging
    from app.main import _RedactConnectorSecret
    rec = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %d',
                            ("1.2.3.4", "POST", "/mcp/s3cr3t-Tok_en/mcp", "1.1", 200), None)
    _RedactConnectorSecret().filter(rec)
    assert rec.getMessage() == '1.2.3.4 - "POST /mcp/<redacted>/mcp HTTP/1.1" 200'
