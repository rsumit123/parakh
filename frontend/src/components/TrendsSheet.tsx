import { useEffect, useState } from "react";
import { getHistory, type HistoryDay, type Totals } from "../api/diet";
import { dayTitle, weekdayLetter } from "../diet/dates";
import { LineChart } from "./LineChart";
import { METRICS, series, show } from "./WeekChart";
import styles from "./TrendsSheet.module.css";

const RANGES = [7, 14, 30];

/** Labels under a run of days: every weekday for a week; otherwise a handful of dates. */
function ticks(days: HistoryDay[]) {
  if (days.length <= 7) return days.map((d, i) => ({ i, text: weekdayLetter(d.date) }));
  const every = Math.ceil(days.length / 5);
  return days.flatMap((d, i) => ((days.length - 1 - i) % every === 0 ? [{ i, text: d.date.slice(8).replace(/^0/, "") }] : []));
}

/** Full-screen trends: one small line chart per nutrient, each on its own scale
 * (kcal and grams never share an axis). Touching any chart moves one crosshair
 * across all of them, so a single day can be read top to bottom. */
export function TrendsSheet({ token, today, onClose }: { token: string; today: string; onClose: () => void }) {
  const [range, setRange] = useState(7);
  const [data, setData] = useState<{ targets: Totals; days: HistoryDay[] } | null>(null);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    setActive(null);
    getHistory(token, range, today).then(setData).catch(() => setData(null));
  }, [token, range, today]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const days = data?.days ?? [];
  const logged = days.filter((d) => d.count).length;
  const a = active != null ? days[active] : null;

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label="Trends">
      <div className={styles.top}>
        <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
        <span className={styles.h}>Trends</span>
        <div className={styles.seg} role="tablist" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r} role="tab" aria-selected={r === range} className={r === range ? styles.on : ""}
              onClick={() => setRange(r)}>{r}d</button>
          ))}
        </div>
      </div>
      <div className={styles.readout}>
        {a ? (
          <>
            <b>{dayTitle(a.date, today)}</b>
            <span>{a.count ? `${a.count} item${a.count > 1 ? "s" : ""} logged` : "Nothing logged"}</span>
            <button onClick={() => setActive(null)}>Show averages</button>
          </>
        ) : (
          <span>Averages over {logged} logged day{logged === 1 ? "" : "s"} · touch any chart to read a day</span>
        )}
      </div>
      <div className={styles.list}>
        {!data && <div className={`skeleton ${styles.skel}`} />}
        {data && METRICS.map((m) => {
          const { values, partial } = series(days, m.key);
          const target = show(m.key, data.targets[m.key] ?? 0);
          const got = values.filter((v): v is number => v != null);
          // values are already in display units, so only round: salt to 0.1 g, the rest whole
          const mean = got.reduce((s, v) => s + v, 0) / got.length;
          const avg = got.length ? (m.key === "salt_g" ? Math.round(mean * 10) / 10 : Math.round(mean)) : null;
          const v = active != null ? values[active] : avg;
          const word = active != null ? "" : "avg ";
          return (
            <section key={m.key} className={styles.card}>
              <div className={styles.row}>
                <span className={styles.name}>{m.label}</span>
                <span className={styles.val}>
                  <em>{word}</em>
                  <b>{v == null ? "—" : `${v.toLocaleString("en-IN")}${active != null && partial[active] ? "+" : ""}`}</b>
                  <span> / {target} {m.unit}</span>
                </span>
              </div>
              <LineChart values={values} partial={partial} target={target} active={active} onActive={setActive}
                ticks={ticks(days)} height={96} top={8}
                ariaLabel={`${m.label}, ${m.line} ${target} ${m.unit}`} />
            </section>
          );
        })}
        {data && <p className={styles.fine}>Dashed line: your target for each nutrient. Hollow dots: some foods that day had no data for it, so the value is a minimum. Empty days are left as gaps.</p>}
      </div>
    </div>
  );
}
