import type { HistoryDay } from "../api/diet";
import { kcal } from "../diet/portion";
import { dayTitle, weekdayLetter } from "../diet/dates";
import styles from "./WeekChart.module.css";

// Geometry in viewBox units; the SVG scales to the card width.
const W = 320, H = 132, TOP = 22, BASE = 104, BAR = 18;

/** Calories per day for a run of days, against the energy target. One series, so no
 * legend: the title names it. Tapping a day selects it. Only the selected day's
 * value is labelled, so the chart stays quiet. */
export function WeekChart({ days, targetKj, selected, today, onSelect }: {
  days: HistoryDay[]; targetKj: number; selected: string; today: string;
  onSelect: (date: string) => void;
}) {
  const target = kcal(targetKj);
  const values = days.map((d) => kcal(d.totals.energy_kj));
  const max = Math.max(target * 1.15, ...values.map((v) => v * 1.08), 1);
  const y = (v: number) => BASE - (v / max) * (BASE - TOP);
  const step = W / days.length;
  const targetY = y(target);

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>Calories · last {days.length} days</span>
        <span className={styles.note}>target {target}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="group"
        aria-label={`Calories per day, target ${target} kcal`}>
        <line x1={0} x2={W} y1={BASE} y2={BASE} className={styles.axis} />
        {target > 0 && <line x1={0} x2={W} y1={targetY} y2={targetY} className={styles.target} />}
        {days.map((d, i) => {
          const v = values[i];
          const cx = step * i + step / 2;
          const h = BASE - y(v);
          const on = d.date === selected;
          const future = d.date > today;
          return (
            <g key={d.date} className={styles.col} role="button" tabIndex={future ? -1 : 0}
              aria-pressed={on} aria-label={`${dayTitle(d.date, today)}: ${v} kcal`}
              onClick={() => !future && onSelect(d.date)}
              onKeyDown={(e) => { if (!future && (e.key === "Enter" || e.key === " ")) onSelect(d.date); }}>
              {/* hit target: the whole column, much larger than the bar */}
              <rect x={step * i} y={0} width={step} height={H} fill="transparent" />
              {h > 0 && (
                // rounded top, square base anchored to the baseline
                <path className={on ? styles.barOn : styles.bar}
                  d={`M${cx - BAR / 2},${BASE} V${BASE - h + Math.min(4, h)} q0,-${Math.min(4, h)} ${Math.min(4, h)},-${Math.min(4, h)} H${cx + BAR / 2 - Math.min(4, h)} q${Math.min(4, h)},0 ${Math.min(4, h)},${Math.min(4, h)} V${BASE} Z`} />
              )}
              {on && <text x={cx} y={Math.max(12, BASE - h - 7)} className={styles.val}>{v}</text>}
              <text x={cx} y={BASE + 19} className={on ? styles.dayOn : styles.day}>{weekdayLetter(d.date)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
