"""The Parakh MCP server: a user's food diary as Claude tools.

Read tools give Claude the diary for advice (a day, a range with averages, foods,
targets, weight). Write tools log, edit and delete entries the same way the app
does, so totals, charts and suggestions in the app stay in step. Mounted per user
at /mcp/<secret>/mcp (see app/connector.py); every tool acts on that user only.
"""
import re
import uuid
from datetime import date as Date, datetime, timedelta
from zoneinfo import ZoneInfo

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings

from app.connector import current_identity
from app.nutrition.foods import FOODS, catalog, per100g
from app.nutrition.targets import MACRO_KEYS, OPTIONAL_KEYS, compute_targets, summarize_day, targets_basis
from app.services.photos import KEY_PREFIX

KJ = 4.184
MEALS = ("breakfast", "lunch", "snack", "dinner")
_ALLOWED_HOSTS = ["parakh-api.skdev.one", "parakh-api.skdev.one:*",
                  "localhost", "localhost:*", "127.0.0.1", "127.0.0.1:*", "testserver"]
_COUNT = re.compile(r"^(.*\S)\s*[×x]\s*(\d{1,2})$")


def india_today() -> str:
    """Users are in India; a UTC date would flip to 'yesterday' before 5:30 am."""
    return datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()


LABEL = {"energy_kj": "kcal", "sugars_g": "sugar", "sat_fat_g": "satfat", "salt_g": "salt",
         "fibre_g": "fibre", "protein_g": "protein", "carbs_g": "carbs", "fat_g": "fat"}


def _kcal(kj) -> int:
    return round((kj or 0) / KJ)


def _g(v) -> str:
    return "?" if v is None else (f"{v:.1f}" if v < 10 else f"{v:.0f}")


def build_mcp(*, diet, photo_store=None, today=india_today) -> MCPServer:
    # Input problems raise ToolError: its message reaches Claude so it can fix the call.
    # Any other exception is reported only as a generic tool failure.
    mcp = MCPServer("Parakh", instructions=(
        "The user's Parakh food diary (Indian food tracker). Read tools are safe. Before any write "
        "(log_food, log_meal, edit_entry, delete_entry, log_weight), state the foods, portions and meal "
        "you will log and get the user's OK, unless they already gave exact amounts. Dates are "
        "YYYY-MM-DD in India time; omit for today. Energy is shown in kcal."))

    def _day(d: str) -> str:
        d = d or today()
        try:
            return Date.fromisoformat(d).isoformat()
        except ValueError:
            raise ToolError(f"bad date {d!r}, use YYYY-MM-DD") from None

    def _meal(m: str | None) -> str | None:
        if m is None or m == "":
            return None
        m = m.lower().strip().rstrip("s")  # "snacks" -> "snack"
        if m not in MEALS:
            raise ToolError(f"meal must be one of {', '.join(MEALS)}")
        return m

    def _scaled(per100: dict, grams: float) -> dict:
        return {k: (None if per100.get(k) is None and k in OPTIONAL_KEYS else float(per100.get(k) or 0) * grams / 100)
                for k in MACRO_KEYS}

    def _resolve(food_id: str | None, name: str | None, count: float | None, grams: float | None,
                 nutrition_per_100g: dict | None) -> tuple[str, float, dict]:
        """(entry name, grams, per-100 g macros) for a dish given by table id or custom nutrition."""
        if food_id:
            f = FOODS.get(food_id)
            if f is None:
                raise ToolError(f"unknown food_id {food_id!r}; use search_foods")
            if count and f.unit_g:
                n = max(1, round(count))
                return (name or f"{f.name} ×{n}"), n * f.unit_g, per100g(f)
            g = grams or f.default_g
            return (name or f.name), g, per100g(f)
        if not (name and grams and nutrition_per_100g):
            raise ToolError("give a food_id (from search_foods), or name + grams + nutrition_per_100g")
        per = dict(nutrition_per_100g)
        if "energy_kcal" in per:
            per["energy_kj"] = float(per.pop("energy_kcal")) * KJ
        unknown = set(per) - set(MACRO_KEYS)
        if unknown:
            raise ToolError(f"unknown nutrition keys {sorted(unknown)}; use energy_kcal and {', '.join(MACRO_KEYS[1:])}")
        return name, float(grams), per

    def _line(e: dict) -> str:
        grp = f" [meal group: {e['group_name']}]" if e.get("group_id") else ""
        return (f"  #{e['id']} {e['name']} — {e['quantity_g']:.0f} g · {_kcal(e['energy_kj'])} kcal · "
                f"P {_g(e['protein_g'])} C {_g(e['carbs_g'])} F {_g(e['fat_g'])} fibre {_g(e['fibre_g'])} "
                f"sugar {_g(e['sugars_g'])} satfat {_g(e['sat_fat_g'])} salt {_g(e['salt_g'])}{grp}")

    def _totals_line(totals: dict, targets: dict) -> str:
        return " · ".join(f"{LABEL[k]} "
                          f"{_kcal(totals[k]) if k == 'energy_kj' else _g(totals[k])}/"
                          f"{_kcal(targets[k]) if k == 'energy_kj' else _g(targets[k])}" for k in MACRO_KEYS)

    def _day_text(ident: str, d: str) -> str:
        entries = diet.day_entries(ident, d)
        targets = compute_targets(diet.get_profile(ident))
        s = summarize_day(entries, targets)
        out = [f"{d}: {len(entries)} entries. {s['headline']}",
               f"Totals vs targets: {_totals_line(s['totals'], targets)}"]
        if s["partial"]:
            out.append(f"(Some entries lack {', '.join(s['partial'])}; those totals are a minimum.)")
        for m in MEALS:
            es = [e for e in entries if (e.get("meal") or "snack") == m]
            if es:
                out.append(f"{m} — {sum(_kcal(e['energy_kj']) for e in es)} kcal")
                out += [_line(e) for e in es]
        return "\n".join(out)

    # ---------------- read ----------------
    @mcp.tool()
    def get_day(date: str = "") -> str:
        """One day of the diary: every entry (id, grams, kcal and macros, meal, meal group), the
        day's totals against the user's targets, and the headline (what's low / over).

        Args:
            date: YYYY-MM-DD (India time); omit for today.
        """
        return _day_text(current_identity(), _day(date))

    @mcp.tool()
    def get_summary(days: int = 7, end: str = "") -> str:
        """Daily totals for a run of days plus averages over the days that have entries, and how
        many days each limit (sugar, sat fat, salt, kcal) went over and each goal (protein, fibre)
        fell short. Use for "how was my week / month" and before giving diet advice.

        Args:
            days: how many days ending at `end` (1-120).
            end: last day, YYYY-MM-DD; omit for today.
        """
        ident = current_identity()
        days = max(1, min(int(days), 120))
        end_d = Date.fromisoformat(_day(end))
        start = (end_d - timedelta(days=days - 1)).isoformat()
        targets = compute_targets(diet.get_profile(ident))
        by_day: dict[str, list] = {}
        for e in diet.range_entries(ident, start, end_d.isoformat()):
            by_day.setdefault(e["day"], []).append(e)
        rows, sums, empty = [], {k: 0.0 for k in MACRO_KEYS}, []

        def flush_empty():
            # runs of unlogged days fold into one line, so a month doesn't drown in blanks
            if empty:
                rows.append(f"  {empty[0]}: nothing logged" if len(empty) == 1
                            else f"  {empty[0]} to {empty[-1]}: nothing logged ({len(empty)} days)")
                empty.clear()
        over = {k: 0 for k in ("energy_kj", "sugars_g", "sat_fat_g", "salt_g")}
        under = {k: 0 for k in ("protein_g", "fibre_g")}
        for i in range(days):
            d = (end_d - timedelta(days=days - 1 - i)).isoformat()
            if d not in by_day:
                empty.append(d)
                continue
            flush_empty()
            t = summarize_day(by_day[d], targets)["totals"]
            for k in MACRO_KEYS:
                sums[k] += t[k]
            for k in over:
                over[k] += t[k] > targets[k]
            for k in under:
                under[k] += t[k] < targets[k]
            rows.append(f"  {d}: kcal {_kcal(t['energy_kj'])} · protein {_g(t['protein_g'])} · carbs {_g(t['carbs_g'])} · "
                        f"fat {_g(t['fat_g'])} · fibre {_g(t['fibre_g'])} · sugar {_g(t['sugars_g'])} · "
                        f"satfat {_g(t['sat_fat_g'])} · salt {_g(t['salt_g'])} ({len(by_day[d])} entries)")
        flush_empty()
        n = len(by_day)
        head = [f"{start} to {end_d.isoformat()}: {n} of {days} days logged."]
        if n:
            avg = {k: v / n for k, v in sums.items()}
            head.append(f"Average per logged day vs target: {_totals_line(avg, targets)}")
            head.append("Over the limit on: " + ", ".join(f"{LABEL[k]} {v}/{n} days" for k, v in over.items()))
            head.append("Short of the goal on: " + ", ".join(f"{LABEL[k]} {v}/{n} days" for k, v in under.items()))
        return "\n".join(head + ["Per day:"] + rows)

    @mcp.tool()
    def search_foods(query: str, limit: int = 8) -> str:
        """Search Parakh's reference table of common Indian foods (roti, dal, idli, paneer, eggs,
        fruit...). Returns food_id for log_food / log_meal, the per-piece weight for countable
        foods, a typical serving, and nutrition per 100 g.

        Args:
            query: a food name or other name ("chapati", "dahi", "egg white").
            limit: max results (1-20).
        """
        q = " ".join(query.lower().split())
        hits = []
        for f in catalog():
            names = [f["name"].lower(), f["id"].replace("_", " "), *[a.lower() for a in f["aliases"]]]
            score = min((0 if n == q else 1 if n.startswith(q) else 2 if q in n else 9) for n in names)
            if score < 9:
                hits.append((score, f))
        hits.sort(key=lambda x: x[0])
        if not hits:
            return f"No reference food matches {query!r}. Log it with name + grams + nutrition_per_100g."
        out = []
        for _, f in hits[:max(1, min(limit, 20))]:
            p = f["per100g"]
            unit = f" · one piece {f['unit_g']:g} g" if f["unit_g"] else ""
            out.append(f"{f['id']}: {f['name']}{unit} · typical {f['default_g']:g} g · per 100 g: {_kcal(p['energy_kj'])} kcal, "
                       f"protein {p['protein_g']}, carbs {p['carbs_g']}, fat {p['fat_g']}, fibre {p['fibre_g']}, "
                       f"sugar {p['sugars_g']}, satfat {p['sat_fat_g']}, salt {p['salt_g']}")
        return "\n".join(out)

    @mcp.tool()
    def get_frequent_foods(limit: int = 20) -> str:
        """The user's own foods, most recent first, with how often each was logged and its last
        amount — what they actually eat (their tea, usual dal, regular protein bar...).

        Args:
            limit: how many (1-50).
        """
        items = diet.recent_foods(current_identity(), limit=max(1, min(limit, 50)))
        if not items:
            return "No foods logged yet."
        return "\n".join(f"{i['name']} — {i['uses']}× · last {i['quantity_g']:.0f} g on {i['last_day']}"
                         f" ({_kcal((i['per100g'].get('energy_kj') or 0) * i['quantity_g'] / 100)} kcal)" for i in items)

    @mcp.tool()
    def get_profile_targets() -> str:
        """The user's About-you profile and daily targets, and how the targets were set
        (ICMR-NIN 2020 energy and fibre, 0.83 g/kg protein, WHO limits; overrides marked custom)."""
        ident = current_identity()
        p = diet.get_profile(ident)
        t = compute_targets(p)
        base = compute_targets(p, with_overrides=False)
        prof = ", ".join(f"{k} {p.get(k)}" for k in ("sex", "age", "height_cm", "weight_kg", "activity", "goal"))
        rows = [f"{k}: {_kcal(t[k]) if k == 'energy_kj' else _g(t[k])}{' (custom)' if t[k] != base[k] else ''}"
                for k in MACRO_KEYS]
        return f"Profile: {prof}. Targets basis: {targets_basis(p)}.\n" + "\n".join(rows)

    @mcp.tool()
    def get_weight(days: int = 90) -> str:
        """Weigh-ins over the last `days` days (oldest first) and the latest one.

        Args:
            days: how far back (1-400).
        """
        ident = current_identity()
        end = Date.fromisoformat(today())
        rows = diet.weights(ident, (end - timedelta(days=max(1, min(days, 400)) - 1)).isoformat(), end.isoformat())
        if not rows:
            return "No weigh-ins in that period."
        return "\n".join(f"{w['day']}: {w['weight_kg']:.1f} kg" for w in rows)

    # ---------------- write ----------------
    @mcp.tool()
    def log_food(meal: str, food_id: str = "", count: float = 0, grams: float = 0, name: str = "",
                 nutrition_per_100g: dict | None = None, date: str = "") -> str:
        """Log one food. Either a reference food (food_id from search_foods, with `count` pieces for
        countable foods like roti/idli/egg, or `grams`; omitted = a typical serving), or a custom
        food with name + grams + nutrition_per_100g (energy_kcal, protein_g, carbs_g, fat_g,
        fibre_g, sugars_g, sat_fat_g, salt_g; unknown carbs/fat may be left out).
        Confirm the food, amount and meal with the user first.

        Args:
            meal: breakfast, lunch, snack or dinner.
            food_id: id from search_foods.
            count: pieces, for countable foods.
            grams: amount in grams (or ml for drinks).
            name: display name (optional for food_id; required for custom).
            nutrition_per_100g: custom nutrition per 100 g.
            date: YYYY-MM-DD; omit for today.
        """
        ident = current_identity()
        d, m = _day(date), _meal(meal)
        nm, g, per = _resolve(food_id or None, name or None, count or None, grams or None, nutrition_per_100g)
        e = diet.add_entry(identity=ident, day=d, kind="unpackaged" if food_id else "manual", name=nm, brand="",
                           quantity_g=g, macros=_scaled(per, g), meal=m)
        return f"Logged on {d} ({m}):\n{_line(e)}\n\n{_day_text(ident, d)}"

    @mcp.tool()
    def log_meal(meal: str, dishes: list[dict], name: str = "", date: str = "") -> str:
        """Log several dishes eaten together as one grouped meal (shown as one row in the app, each
        dish still editable). Each dish is {"food_id", "count" or "grams"} or a custom
        {"name", "grams", "nutrition_per_100g"}. Confirm dishes and portions with the user first.

        Args:
            meal: breakfast, lunch, snack or dinner.
            dishes: 1-20 dishes as above.
            name: the meal's display name, e.g. "Roti, Dal & Dahi" (default: first dishes).
            date: YYYY-MM-DD; omit for today.
        """
        ident = current_identity()
        d, m = _day(date), _meal(meal)
        if not 1 <= len(dishes) <= 20:
            raise ToolError("give 1-20 dishes")
        resolved = [_resolve(x.get("food_id"), x.get("name"), x.get("count"), x.get("grams"), x.get("nutrition_per_100g"))
                    for x in dishes]
        gid = uuid.uuid4().hex if len(resolved) > 1 else None
        gname = (name.strip() or ", ".join(r[0] for r in resolved[:2])) if gid else None
        made = [diet.add_entry(identity=ident, day=d, kind="unpackaged", name=nm, brand="", quantity_g=g,
                               macros=_scaled(per, g), meal=m, group_id=gid, group_name=gname)
                for nm, g, per in resolved]
        return (f"Logged {len(made)} dishes on {d} ({m}){f' as {gname!r}' if gname else ''}:\n"
                + "\n".join(_line(e) for e in made) + f"\n\n{_day_text(ident, d)}")

    @mcp.tool()
    def edit_entry(entry_id: int, count: float = 0, grams: float = 0, name: str = "", meal: str = "") -> str:
        """Fix a logged entry: change its pieces (for names like "Roti ×4"), grams, name or meal.
        Nutrients rescale with the amount. Get entry ids from get_day.

        Args:
            entry_id: the entry's id.
            count: new number of pieces (entry name must end in "×N").
            grams: new amount in grams.
            name: new name.
            meal: breakfast, lunch, snack or dinner.
        """
        ident = current_identity()
        e = diet.get_entry(ident, entry_id)
        if e is None:
            return f"Entry #{entry_id} not found."
        new_name, new_g = (name or None), (grams or None)
        if count:
            mm = _COUNT.match(e["name"])
            if not mm:
                raise ToolError(f"#{entry_id} {e['name']!r} isn't counted in pieces; give grams instead")
            n = max(1, round(count))
            new_g = e["quantity_g"] / int(mm.group(2)) * n
            new_name = new_name or f"{mm.group(1)} ×{n}"
        out = diet.update_entry(ident, entry_id, name=new_name, quantity_g=new_g, meal=_meal(meal) if meal else None)
        return f"Updated:\n{_line(out)}\n\n{_day_text(ident, out['day'])}"

    @mcp.tool()
    def delete_entry(entry_id: int) -> str:
        """Delete one logged entry (confirm with the user first). Returns what was removed, so it
        can be re-logged if that was a mistake.

        Args:
            entry_id: the entry's id, from get_day.
        """
        ident = current_identity()
        e = diet.get_entry(ident, entry_id)
        if e is None or not diet.delete_entry(ident, entry_id):
            return f"Entry #{entry_id} not found."
        photo = e.get("image_url") or ""
        rest = diet.group_entries(ident, e["group_id"]) if e.get("group_id") else []
        if photo.startswith(KEY_PREFIX):
            if rest and not any(x.get("image_url") for x in rest):
                diet.set_image(ident, rest[0]["id"], photo)   # the meal keeps its photo
            elif photo_store:
                try:
                    photo_store.delete(photo)
                except Exception:
                    pass
        return f"Deleted from {e['day']} ({e.get('meal')}):\n{_line(e)}\n\n{_day_text(ident, e['day'])}"

    @mcp.tool()
    def log_weight(weight_kg: float, date: str = "") -> str:
        """Record a weigh-in (one per day; a second replaces it). The latest weigh-in also updates
        the profile weight, so targets follow it.

        Args:
            weight_kg: 25-300.
            date: YYYY-MM-DD; omit for today.
        """
        if not 25 <= weight_kg <= 300:
            raise ToolError("weight_kg must be 25-300")
        ident = current_identity()
        d = _day(date)
        diet.log_weight(ident, d, round(weight_kg, 1))
        return f"Logged {weight_kg:.1f} kg on {d}.\n" + get_profile_targets()

    return mcp


def mcp_asgi_app(mcp: MCPServer):
    # Stateless: each request carries its own tool call and runs inside the request
    # ConnectorApp scoped to the token's owner.
    return mcp.streamable_http_app(stateless_http=True,
                                   transport_security=TransportSecuritySettings(allowed_hosts=_ALLOWED_HOSTS))
