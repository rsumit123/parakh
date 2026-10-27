import { useEffect, useState } from "react";
import {
  getDay, getHistory, deleteLog, editLog, addLog,
  type DietDay, type HistoryDay, type LogEntry, type MacroKey,
} from "../api/diet";
import { kcal, isLiquid } from "../diet/portion";
import { addDays, dayTitle, shortDate } from "../diet/dates";
import { WeekChart } from "../components/WeekChart";
import { FoodSheet, type FoodValues } from "../components/FoodSheet";
import styles from "./TodayScreen.module.css";

const ROWS: { key: MacroKey; label: string; unit: string; toDisplay?: (v: number) => number }[] = [
  { key: "energy_kj", label: "Energy", unit: "kcal", toDisplay: kcal },
  { key: "protein_g", label: "Protein", unit: "g" },
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

type Sheet = { t: "choose" } | { t: "manual" } | { t: "edit"; entry: LogEntry } | null;

export function TodayScreen({ token, date, today, onChangeDate, onSnapMeal, onOpenTargets }: {
  token: string; date: string; today: string;
  onChangeDate: (date: string) => void; onSnapMeal: () => void; onOpenTargets: () => void;
}) {
  const [day, setDay] = useState<DietDay | null>(null);
  const [week, setWeek] = useState<{ targets: DietDay["targets"]; days: HistoryDay[] } | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [version, setVersion] = useState(0);  // bumps after any change, to refresh the chart
  const end = chartEnd(date, today);

  useEffect(() => {
    setDay(null);
    getDay(token, date).then(setDay).catch(() => setDay(null));
  }, [token, date]);
  useEffect(() => {
    getHistory(token, CHART_DAYS, end).then(setWeek).catch(() => setWeek(null));
  }, [token, end, version]);

  const apply = (d: DietDay) => { setDay(d); setVersion((v) => v + 1); };
  const remove = async (id: number) => {
    setSheet(null);
    try { apply(await deleteLog(token, id)); } catch { /* ignore */ }
  };
  const saveEdit = async (entry: LogEntry, v: FoodValues) => {
    setSheet(null);
    try { apply(await editLog(token, entry.id, { name: v.name, quantity_g: v.grams, macros: v.macros })); }
    catch { /* ignore */ }
  };
  const addManual = async (v: FoodValues) => {
    setSheet(null);
    const per100g = { ...v.macros };
    (Object.keys(per100g) as MacroKey[]).forEach((k) => { per100g[k] = (v.macros[k] * 100) / v.grams; });
    try { apply(await addLog(token, { kind: "manual", name: v.name, quantity_g: v.grams, per100g, day: date })); }
    catch { /* ignore */ }
  };

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
        <WeekChart days={week.days} targetKj={week.targets.energy_kj} selected={date}
          today={today} onSelect={onChangeDate} />
      )}

      {!day && <div className={`skeleton ${styles.skel}`} />}
      {day && (
        <>
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
                    <span className={styles.mval}><b>{consumed}</b> / {target} {r.unit}</span>
                  </div>
                  <div className={styles.bar}><div className={styles.fill} style={{ width: `${pct}%`, background: color }} /></div>
                </div>
              );
            })}
          </div>
          <div className={styles.sec}>Logged · {day.entries.length}</div>
          {day.entries.map((e) => (
            <div key={e.id} className={styles.item}>
              <button className={styles.itemMain} onClick={() => setSheet({ t: "edit", entry: e })}
                aria-label={`Edit ${e.name}`}>
                <span className={styles.thumb}>{e.kind === "packaged" ? "🛒" : e.kind === "manual" ? "✍️" : "🍽"}</span>
                <span className={styles.itext}>
                  <span className={styles.iname}>{e.name}</span>
                  <span className={styles.imeta}>{Math.round(e.quantity_g)}{isLiquid(e.name) ? "ml" : "g"} · tap to edit</span>
                </span>
                <span className={styles.ical}>{kcal(e.energy_kj)}</span>
              </button>
              <button className={styles.del} onClick={() => remove(e.id)} aria-label={`Remove ${e.name}`}>🗑</button>
            </div>
          ))}
          {day.entries.length === 0 && <div className={styles.empty}>Nothing logged {isToday ? "yet" : "that day"}.</div>}
          <button className={styles.add} onClick={() => setSheet({ t: "choose" })}>＋ Add food</button>
        </>
      )}

      {sheet?.t === "choose" && (
        <div className={styles.chooseWrap} role="dialog" aria-label="Add food">
          <div className={styles.scrim} onClick={() => setSheet(null)} />
          <div className={styles.choose}>
            <div className={styles.grab} />
            <button onClick={() => { setSheet(null); onSnapMeal(); }}>
              <span>📷</span><b>Snap a meal</b><em>AI estimates the dishes</em>
            </button>
            <button onClick={() => setSheet({ t: "manual" })}>
              <span>✍️</span><b>Enter manually</b><em>Type the name and nutrients</em>
            </button>
          </div>
        </div>
      )}
      {sheet?.t === "manual" && (
        <FoodSheet mode="add" onSave={addManual} onCancel={() => setSheet(null)} />
      )}
      {sheet?.t === "edit" && (
        <FoodSheet mode="edit"
          initial={{ name: sheet.entry.name, grams: sheet.entry.quantity_g, macros: sheet.entry }}
          onSave={(v) => saveEdit(sheet.entry, v)}
          onDelete={() => remove(sheet.entry.id)}
          onCancel={() => setSheet(null)} />
      )}
    </div>
  );
}
