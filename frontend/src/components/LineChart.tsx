import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import styles from "./LineChart.module.css";

const W = 320;

/** One series per day, drawn as a line against a dashed target. Days with nothing
 * logged are gaps (null), not zeros. Touch or drag anywhere on the plot to pick the
 * nearest day; `active` is controlled so several charts can share one crosshair.
 * Vertical swipes still scroll the page (touch-action: pan-y). */
export function LineChart({ values, target, partial, active, onActive, marked, ticks, height = 132, top = 10,
  tip, ariaLabel }: {
  values: (number | null)[]; target: number; partial?: boolean[];
  active: number | null; onActive: (i: number) => void;
  marked?: number;  // the day open on Today: a ringed dot
  ticks: { i: number; text: string; strong?: boolean }[];
  height?: number; top?: number;  // `top` leaves room above the line for a tooltip
  tip?: ReactNode;  // shown above the active day
  ariaLabel: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const n = values.length;
  const base = height - 22;
  const max = Math.max(target * 1.15, ...values.map((v) => (v ?? 0) * 1.1), 1e-6);
  const y = (v: number) => base - (v / max) * (base - top);
  const x = (i: number) => (W / n) * (i + 0.5);

  // Contiguous runs of logged days; each run is one line + its soft fill.
  const runs: number[][] = [];
  values.forEach((v, i) => {
    if (v == null) return;
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === i - 1) last.push(i); else runs.push([i]);
  });

  const at = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n)));
  };
  const down = (e: PointerEvent) => { dragging.current = true; onActive(at(e)); };
  const move = (e: PointerEvent) => { if (dragging.current || e.pointerType === "mouse") onActive(at(e)); };
  const up = () => { dragging.current = false; };
  const key = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    onActive(Math.min(n - 1, Math.max(0, (active ?? n - 1) + step)));
  };

  return (
    <div className={styles.wrap}>
      <svg ref={ref} viewBox={`0 0 ${W} ${height}`} className={styles.svg} role="img" aria-label={ariaLabel}
        tabIndex={0} onKeyDown={key}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}>
        <line x1={0} x2={W} y1={base} y2={base} className={styles.axis} />
        {target > 0 && <line x1={0} x2={W} y1={y(target)} y2={y(target)} className={styles.target} />}
        {active != null && <line x1={x(active)} x2={x(active)} y1={top - 6} y2={base} className={styles.cross} />}
        {runs.map((run) => {
          const pts = run.map((i) => `${x(i)},${y(values[i]!)}`).join(" L");
          return (
            <g key={run[0]}>
              {run.length > 1 && (
                <path className={styles.fill}
                  d={`M${x(run[0])},${base} L${pts} L${x(run[run.length - 1])},${base} Z`} />
              )}
              {run.length > 1 && <path className={styles.line} d={`M${pts}`} />}
            </g>
          );
        })}
        {values.map((v, i) => v == null ? null : (
          <circle key={i} cx={x(i)} cy={y(v)}
            r={i === active ? 5 : n > 14 ? 2.5 : 3.5}
            className={partial?.[i] ? styles.dotPartial : i === active ? styles.dotOn : styles.dot} />
        ))}
        {marked != null && values[marked] != null && marked !== active && (
          <circle cx={x(marked)} cy={y(values[marked]!)} r={6.5} className={styles.ring} />
        )}
        {ticks.map((t) => (
          // dense runs: pin edge labels inside the plot so they aren't clipped
          <text key={t.i} x={n > 7 && t.i === n - 1 ? W - 2 : x(t.i)} y={height - 5}
            textAnchor={n > 7 && t.i === n - 1 ? "end" : undefined}
            className={t.strong ? styles.tickOn : styles.tick}>{t.text}</text>
        ))}
      </svg>
      {tip && active != null && (
        // Positioned over the day, clamped so it never leaves the card.
        <div className={styles.tip}
          style={{ left: `clamp(70px, ${((active + 0.5) / n) * 100}%, calc(100% - 70px))` }}
          onPointerDown={(e) => e.stopPropagation()}>
          {tip}
        </div>
      )}
    </div>
  );
}
