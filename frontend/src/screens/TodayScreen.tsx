import { useEffect, useRef, useState } from "react";
import {
  getDay, getHistory, deleteLog, editLog, addLog, getSuggestions, repeatMeal, MACRO_KEYS,
  type DietDay, type HistoryDay, type LogEntry, type LogBody, type MacroKey, type Macros, type OptKey, type RecentFood,
  type Meal, type MealSuggestion, type RefFood,
} from "../api/diet";
import { kcal, isLiquid, portionMacros } from "../diet/portion";
import { addDays, dayTitle, shortDate } from "../diet/dates";
import { MEALS, entryMeal, mealForTime } from "../diet/meals";
import { WeekChart } from "../components/WeekChart";
import { FoodSheet, type FoodValues } from "../components/FoodSheet";
import { AddFoodSheet } from "../components/AddFoodSheet";
import { MealSuggestions } from "../components/MealSuggestions";
import { TrendsSheet } from "../components/TrendsSheet";
import { syncReminders } from "../diet/reminders";
import { FoodPicker } from "../components/FoodPicker";
import styles from "./TodayScreen.module.css";

const ROWS: { key: MacroKey; label: string; unit: string; toDisplay?: (v: number) => number }[] = [
  { key: "energy_kj", label: "Energy", unit: "kcal", toDisplay: kcal },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "carbs_g", label: "Carbs", unit: "g" },
  { key: "fat_g", label: "Fat", unit: "g" },
  { key: "fibre_g", label: "Fibre", unit: "g" },
  { key: "sugars_g", label: "Sugar", unit: "g" },
  { key: "sat_fat_g", label: "Sat fat", unit: "g" },
  { key: "salt_g", label: "Salt", unit: "g" },
];
const CHART_DAYS = 7;

/** Window of days for the chart: the last week while the selected day is in it,
 * otherwise a week around the selected day (never past today). */
function chartEnd(date: string, today: string): string {
  if (date >= addDays(today, -(CHART_DAYS - 1))) return today;
  const end = addDays(date, 3);
  return end > today ? today : end;
}

type Sheet = { t: "choose" } | { t: "manual" } | { t: "again"; food: RecentFood } | { t: "food"; food: RefFood }
  | { t: "edit"; entry: LogEntry } | null;

// Back to per-100 g (what /diet/log takes). Unknown carbs/fat stay unknown.
const per100 = (m: Macros, grams: number): Macros => portionMacros(m, grams > 0 ? 10000 / grams : 0);

/** Body to log a remembered food again. Packaged foods go by barcode, so the server
 * recomputes from the catalog; everything else carries its per-100 g macros. */
function relogBody(f: RecentFood, grams: number, macros?: Macros): LogBody {
  if (f.kind === "packaged" && f.barcode) {
    return { kind: "packaged", barcode: f.barcode, name: f.name, brand: f.brand, quantity_g: grams };
  }
  return { kind: f.kind === "manual" ? "manual" : "unpackaged", name: f.name, quantity_g: grams,
           per100g: macros ? per100(macros, grams) : f.per100g };
}

/** Body that re-creates a deleted entry (for Undo). */
function restoreBody(e: LogEntry): LogBody {
  const macros = {} as Record<MacroKey, number | null>;
  MACRO_KEYS.forEach((k) => { macros[k] = e[k]; });
  return { kind: e.kind as LogBody["kind"], barcode: e.barcode, name: e.name, brand: e.brand,
           quantity_g: e.quantity_g, per100g: per100(macros as Macros, e.quantity_g), day: e.day,
           meal: entryMeal(e) };
}

export function TodayScreen({ token, date, today, onChangeDate, onSnapMeal, onOpenTargets }: {
  token: string; date: string; today: string;
  onChangeDate: (date: string) => void; onSnapMeal: () => void; onOpenTargets: () => void;
}) {
  const [day, setDay] = useState<DietDay | null>(null);
  const [week, setWeek] = useState<{ targets: DietDay["targets"]; days: HistoryDay[] } | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [metric, setMetric] = useState<MacroKey>("energy_kj");  // which nutrient the chart shows
  const [trends, setTrends] = useState(false);  // full-screen chart of every nutrient
  const [version, setVersion] = useState(0);  // bumps after any change, to refresh the chart
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const showToast = (text: string, undo: () => void) => {
    clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const end = chartEnd(date, today);

  useEffect(() => {
    setDay(null);
    getDay(token, date).then(setDay).catch(() => setDay(null));
  }, [token, date]);
  // Tell the reminders what's logged today, so a logged meal isn't nudged.
  useEffect(() => {
    if (day && day.date === today) void syncReminders(new Set(day.entries.map(entryMeal)));
  }, [day, today]);
  useEffect(() => {
    getHistory(token, CHART_DAYS, end).then(setWeek).catch(() => setWeek(null));
  }, [token, end, version]);
  const [suggest, setSuggest] = useState<Record<Meal, MealSuggestion[]> | null>(null);
  const [repeating, setRepeating] = useState(false);
  useEffect(() => {
    getSuggestions(token, date).then((r) => setSuggest(r.slots)).catch(() => setSuggest(null));
  }, [token, date]);

  const apply = (d: DietDay) => { setDay(d); setVersion((v) => v + 1); };
  const addSuggestion = async (meal: Meal, s: MealSuggestion) => {
    setRepeating(true);
    try {
      const r = await repeatMeal(token, s.entry_ids, date, meal);
      apply(r);
      const ids = r.created.map((e) => e.id);
      showToast(`Added ${MEALS.find((m) => m.key === meal)?.label.toLowerCase()} · ${s.kcal} kcal`, async () => {
        let last: DietDay | null = null;
        for (const id of ids) { try { last = await deleteLog(token, id); } catch { /* ignore */ } }
        if (last) apply(last);
      });
    } catch { /* ignore */ }
    setRepeating(false);
  };
  // Deletes are instant (no "are you sure?"); the toast offers Undo instead.
  const remove = async (entry: LogEntry) => {
    setSheet(null);
    try {
      apply(await deleteLog(token, entry.id));
      showToast(`Removed ${entry.name}`, async () => {
        try { const r = await addLog(token, restoreBody(entry)); if (r.date === date) apply(r); } catch { /* ignore */ }
      });
    } catch { /* ignore */ }
  };
  const saveEdit = async (entry: LogEntry, v: FoodValues) => {
    setSheet(null);
    try { apply(await editLog(token, entry.id, { name: v.name, quantity_g: v.grams, macros: v.macros, meal: v.meal })); }
    catch { /* ignore */ }
  };
  const log = async (body: LogBody, label: string) => {
    setSheet(null);
    try {
      const r = await addLog(token, { ...body, day: date });
      apply(r);
      showToast(`Added ${label}`, async () => {
        try { apply(await deleteLog(token, r.entry.id)); } catch { /* ignore */ }
      });
    } catch { /* ignore */ }
  };
  const addManual = (v: FoodValues) =>
    log({ kind: "manual", name: v.name, quantity_g: v.grams, per100g: per100(v.macros, v.grams), meal: v.meal }, v.name);
  const quickAdd = (f: RecentFood) => log({ ...relogBody(f, f.quantity_g), meal: mealForTime() }, f.name);
  const addAgain = (f: RecentFood, v: FoodValues) =>
    log({ ...relogBody({ ...f, name: v.name }, v.grams, v.macros), meal: v.meal }, v.name);

  const isToday = date === today;
  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <span className={styles.ttl}>{dayTitle(date, today)}</span>
        <button className={styles.gear} onClick={onOpenTargets} aria-label="Targets">⚙︎</button>
      </div>
      <div className={styles.nav}>
        <button onClick={() => onChangeDate(addDays(date, -1))} aria-label="Previous day">‹</button>
        <span>{shortDate(date)}</span>
        <button onClick={() => onChangeDate(addDays(date, 1))} aria-label="Next day" disabled={isToday}>›</button>
      </div>

      {week && week.days.length > 0 && (
        <WeekChart days={week.days} targets={week.targets} metric={metric} onMetric={setMetric}
          selected={date} today={today} onSelect={onChangeDate} onExpand={() => setTrends(true)} />
      )}
      {trends && (
        <TrendsSheet token={token} today={today} onClose={() => setTrends(false)} />
      )}

      {!day && <div className={`skeleton ${styles.skel}`} />}
      {day && (
        <>
          {day.personalised === false && (
            <button className={styles.personal} onClick={onOpenTargets}>
              <span className={styles.pIcon}>🎯</span>
              <span className={styles.pText}>
                <b>Personalise your targets</b>
                <em>These are generic. Add your age, height & goal — 30 seconds.</em>
              </span>
              <span className={styles.pGo}>›</span>
            </button>
          )}
          <div className={styles.flag}>
            <div className={styles.k}>{isToday ? "Today's gaps" : "That day's gaps"}</div>
            <div className={styles.v}>{day.headline}</div>
          </div>
          <div className={styles.card}>
            {ROWS.map((r) => {
              const disp = r.toDisplay ?? ((v: number) => Math.round(v));
              const consumed = disp(day.totals[r.key]);
              const target = disp(day.targets[r.key]);
              const pct = Math.min(100, day.targets[r.key] ? (day.totals[r.key] / day.targets[r.key]) * 100 : 0);
              const st = day.status[r.key];
              const color = st === "over" ? "var(--red)" : st === "low" ? "var(--amber)" : "var(--green)";
              return (
                <div key={r.key} className={styles.mrow}>
                  <div className={styles.mtop}>
                    <span className={styles.mname}>{r.label}
                      {st !== "ok" && <span className={`${styles.tag} ${styles[st]}`}>{st}</span>}
                    </span>
                    <span className={styles.mval}>
                      <b>{consumed}{(day.partial ?? []).includes(r.key as OptKey) ? "*" : ""}</b> / {target} {r.unit}
                    </span>
                  </div>
                  <div className={styles.bar}><div className={styles.fill} style={{ width: `${pct}%`, background: color }} /></div>
                </div>
              );
            })}
          </div>
          {(day.partial ?? []).length > 0 && (
            <p className={styles.partial}>* Some foods here have no {day.partial!.map((k) => (k === "carbs_g" ? "carb" : "fat")).join(" or ")} data
              (logged before it was tracked, or not on the label), so these totals are a minimum.</p>
          )}
          {MEALS.map((m) => {
            const items = day.entries.filter((e) => entryMeal(e) === m.key);
            if (items.length === 0) {
              const options = suggest?.[m.key] ?? [];
              if (options.length === 0) return null;
              return (
                <section key={m.key} aria-label={m.label}>
                  <div className={styles.sec}><span>{m.icon} {m.label}</span><span>not logged</span></div>
                  <MealSuggestions slotLabel={m.label} suggestions={options} busy={repeating}
                    onAdd={(s) => addSuggestion(m.key, s)} />
                </section>
              );
            }
            const total = kcal(items.reduce((s, e) => s + e.energy_kj, 0));
            return (
              <section key={m.key} aria-label={m.label}>
                <div className={styles.sec}><span>{m.icon} {m.label}</span><span>{total} kcal</span></div>
                {items.map((e) => (
                  <div key={e.id} className={styles.item}>
                    <button className={styles.itemMain} onClick={() => setSheet({ t: "edit", entry: e })}
                      aria-label={`Edit ${e.name}`}>
                      {e.image_url
                        ? <img className={styles.thumbImg} src={e.image_url} alt="" loading="lazy" />
                        : <span className={styles.thumb}>{e.kind === "packaged" ? "🛒" : e.kind === "manual" ? "✍️" : "🍽"}</span>}
                      <span className={styles.itext}>
                        <span className={styles.iname}>{e.name}</span>
                        <span className={styles.imeta}>{Math.round(e.quantity_g)}{isLiquid(e.name) ? "ml" : "g"} · tap to edit</span>
                      </span>
                      <span className={styles.ical}>{kcal(e.energy_kj)}</span>
                    </button>
                    <button className={styles.del} onClick={() => remove(e)} aria-label={`Remove ${e.name}`}>🗑</button>
                  </div>
                ))}
              </section>
            );
          })}
          {day.entries.length === 0 && <div className={styles.empty}>Nothing logged {isToday ? "yet" : "that day"}.</div>}
          <button className={styles.add} onClick={() => setSheet({ t: "choose" })}>＋ Add food</button>
        </>
      )}

      {sheet?.t === "choose" && (
        <AddFoodSheet token={token}
          onSnap={() => { setSheet(null); onSnapMeal(); }}
          onManual={() => setSheet({ t: "manual" })}
          onQuickAdd={quickAdd}
          onPick={(food) => setSheet({ t: "again", food })}
          onFood={(food) => setSheet({ t: "food", food })}
          onClose={() => setSheet(null)} />
      )}
      {sheet?.t === "food" && (
        <FoodPicker food={sheet.food} onCancel={() => setSheet(null)}
          onAdd={(v) => log({ kind: "unpackaged", name: v.name, quantity_g: v.grams, per100g: v.per100g, meal: v.meal }, v.name)} />
      )}
      {sheet?.t === "again" && (
        <FoodSheet mode="add" title="Add again"
          initial={{ name: sheet.food.name, grams: sheet.food.quantity_g,
                     macros: portionMacros(sheet.food.per100g, sheet.food.quantity_g) }}
          onSave={(v) => addAgain(sheet.food, v)} onCancel={() => setSheet(null)} />
      )}
      {sheet?.t === "manual" && (
        <FoodSheet mode="add" onSave={addManual} onCancel={() => setSheet(null)} />
      )}
      {sheet?.t === "edit" && (
        <FoodSheet mode="edit" photoUrl={sheet.entry.image_url || undefined}
          initial={{ name: sheet.entry.name, grams: sheet.entry.quantity_g, macros: sheet.entry,
                     meal: entryMeal(sheet.entry) }}
          onSave={(v) => saveEdit(sheet.entry, v)}
          onDelete={() => remove(sheet.entry)}
          onCancel={() => setSheet(null)} />
      )}
      {toast && (
        <div className={styles.toast} role="status">
          <span>{toast.text}</span>
          <button onClick={() => { toast.undo(); setToast(null); }}>Undo</button>
        </div>
      )}
    </div>
  );
}
