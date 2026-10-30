import { useEffect, useState } from "react";
import type { HistoryDay, MacroKey, OptKey } from "../api/diet";
import { kcal } from "../diet/portion";
import { dayTitle, weekdayLetter } from "../diet/dates";
import { LineChart } from "./LineChart";
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
export const show = (k: MacroKey, v: number) =>
  k === "energy_kj" ? kcal(v) : k === "salt_g" ? Math.round(v * 10) / 10 : Math.round(v);

/** A metric's daily values (null = nothing logged) and incomplete-data flags. */
export function series(days: HistoryDay[], k: MacroKey) {
  return {
    values: days.map((d) => (d.count ? show(k, d.totals[k] ?? 0) : null)),
    partial: days.map((d) => (d.partial ?? []).includes(k as OptKey)),
  };
}

/** One nutrient per day for a run of days, against its target, as a line. One series,
 * so no legend: the title names it. Touch or drag to read any day's value; the
 * tooltip opens that day. The ⤢ button opens every nutrient at once. */
export function WeekChart({ days, targets, metric, onMetric, selected, today, onSelect, onExpand }: {
  days: HistoryDay[]; targets: Record<MacroKey, number>;
  metric: MacroKey; onMetric: (k: MacroKey) => void;
  selected: string; today: string; onSelect: (date: string) => void; onExpand: () => void;
}) {
  const m = METRICS.find((x) => x.key === metric) ?? METRICS[0];
  const target = show(m.key, targets[m.key] ?? 0);
  const { values, partial } = series(days, m.key);
  const sel = days.findIndex((d) => d.date === selected);
  const [active, setActive] = useState<number | null>(sel >= 0 ? sel : null);
  useEffect(() => { setActive(sel >= 0 ? sel : null); }, [sel, days]);

  const a = active != null ? days[active] : null;
  const v = active != null ? values[active] : null;
  const pct = v != null && target > 0 ? ` · ${Math.round((v / target) * 100)}% of ${m.line}` : "";
  const tip = a && (
    <>
      <span className={styles.tipDay}>{dayTitle(a.date, today)}{pct}</span>
      <span className={styles.tipRow}>
        <b className={styles.tipVal}>
          {v == null ? "Nothing logged" : `${v.toLocaleString("en-IN")}${partial[active!] ? "+" : ""} ${m.unit}`}
        </b>
        {a.date !== selected && a.date <= today && (
          <button className={styles.tipGo} onClick={() => onSelect(a.date)}>Open ›</button>
        )}
      </span>
    </>
  );

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
        <span className={styles.note}>{m.line} {target} {m.unit}</span>
        <button className={styles.expand} onClick={onExpand} aria-label="All nutrients, full screen">⤢</button>
      </div>
      <LineChart values={values} partial={partial} target={target} active={active} onActive={setActive}
        marked={sel >= 0 ? sel : undefined} height={160} top={48} tip={tip}
        ticks={days.map((d, i) => ({ i, text: weekdayLetter(d.date), strong: d.date === selected }))}
        ariaLabel={`${m.label} per day, ${m.line} ${target} ${m.unit}. ` + days.map((d, i) =>
          `${dayTitle(d.date, today)}: ${values[i] == null ? "nothing logged" : `${values[i]} ${m.unit}`}`).join("; ")} />
      {partial.some(Boolean) && (
        <p className={styles.foot}>Hollow dots: some foods that day have no {m.label.toLowerCase()} data, so the total is a minimum.</p>
      )}
    </div>
  );
}
