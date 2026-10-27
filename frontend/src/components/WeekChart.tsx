import type { HistoryDay, MacroKey, OptKey } from "../api/diet";
import { kcal } from "../diet/portion";
import { dayTitle, weekdayLetter } from "../diet/dates";
import styles from "./WeekChart.module.css";

// What the target line means for each nutrient: reach it, stay under it, or a guide.
export const METRICS: { key: MacroKey; label: string; unit: string; line: "target" | "goal" | "limit" | "guide" }[] = [
  { key: "energy_kj", label: "Calories", unit: "kcal", line: "target" },  // not "limit": no calorie-shaming
  { key: "protein_g", label: "Protein", unit: "g", line: "goal" },
  { key: "carbs_g", label: "Carbs", unit: "g", line: "guide" },
  { key: "fat_g", label: "Fat", unit: "g", line: "guide" },
  { key: "fibre_g", label: "Fibre", unit: "g", line: "goal" },
  { key: "sugars_g", label: "Sugar", unit: "g", line: "limit" },
  { key: "sat_fat_g", label: "Sat fat", unit: "g", line: "limit" },
  { key: "salt_g", label: "Salt", unit: "g", line: "limit" },
];

// Calories in whole kcal; salt is small, so one decimal; other grams whole.
const show = (k: MacroKey, v: number) =>
  k === "energy_kj" ? kcal(v) : k === "salt_g" ? Math.round(v * 10) / 10 : Math.round(v);

// Geometry in viewBox units; the SVG scales to the card width.
const W = 320, H = 132, TOP = 22, BASE = 104, BAR = 18;

/** One nutrient per day for a run of days, against its target. One series, so no
 * legend: the title names it. Tapping a day selects it; only the selected day's value
 * is labelled. Days missing carb/fat data for some foods draw as faded outlines. */
export function WeekChart({ days, targets, metric, onMetric, selected, today, onSelect }: {
  days: HistoryDay[]; targets: Record<MacroKey, number>;
  metric: MacroKey; onMetric: (k: MacroKey) => void;
  selected: string; today: string; onSelect: (date: string) => void;
}) {
  const m = METRICS.find((x) => x.key === metric) ?? METRICS[0];
  const target = show(m.key, targets[m.key] ?? 0);
  const values = days.map((d) => show(m.key, d.totals[m.key] ?? 0));
  const partial = days.map((d) => (d.partial ?? []).includes(m.key as OptKey));
  const max = Math.max(target * 1.15, ...values.map((v) => v * 1.08), 1e-6);
  const y = (v: number) => BASE - (v / max) * (BASE - TOP);
  const step = W / days.length;
  const targetY = y(target);
  const lineWord = m.line;

  return (
    <div className={styles.card}>
      <div className={styles.chips} role="tablist" aria-label="Nutrient">
        {METRICS.map((x) => (
          <button key={x.key} role="tab" aria-selected={x.key === m.key}
            className={x.key === m.key ? styles.chipOn : styles.chip} onClick={() => onMetric(x.key)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className={styles.head}>
        <span className={styles.title}>{m.label} · last {days.length} days</span>
        <span className={styles.note}>{lineWord} {target} {m.unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="group"
        aria-label={`${m.label} per day, ${lineWord} ${target} ${m.unit}`}>
        <line x1={0} x2={W} y1={BASE} y2={BASE} className={styles.axis} />
        {target > 0 && <line x1={0} x2={W} y1={targetY} y2={targetY} className={styles.target} />}
        {days.map((d, i) => {
          const v = values[i];
          const cx = step * i + step / 2;
          const h = BASE - y(v);
          const r = Math.min(4, h);
          const on = d.date === selected;
          const future = d.date > today;
          const cls = partial[i] ? (on ? styles.barPartialOn : styles.barPartial) : on ? styles.barOn : styles.bar;
          return (
            <g key={d.date} className={styles.col} role="button" tabIndex={future ? -1 : 0}
              aria-pressed={on}
              aria-label={`${dayTitle(d.date, today)}: ${v} ${m.unit}${partial[i] ? " (incomplete)" : ""}`}
              onClick={() => !future && onSelect(d.date)}
              onKeyDown={(e) => { if (!future && (e.key === "Enter" || e.key === " ")) onSelect(d.date); }}>
              {/* hit target: the whole column, much larger than the bar */}
              <rect x={step * i} y={0} width={step} height={H} fill="transparent" />
              {h > 0 && (
                // rounded top, square base anchored to the baseline
                <path className={cls}
                  d={`M${cx - BAR / 2},${BASE} V${BASE - h + r} q0,-${r} ${r},-${r} H${cx + BAR / 2 - r} q${r},0 ${r},${r} V${BASE} Z`} />
              )}
              {on && <text x={cx} y={Math.max(12, BASE - h - 7)} className={styles.val}>{v}{partial[i] ? "*" : ""}</text>}
              <text x={cx} y={BASE + 19} className={on ? styles.dayOn : styles.day}>{weekdayLetter(d.date)}</text>
            </g>
          );
        })}
      </svg>
      {partial.some(Boolean) && (
        <p className={styles.foot}>Outlined bars: some foods that day have no {m.label.toLowerCase()} data, so the total is a minimum.</p>
      )}
    </div>
  );
}
