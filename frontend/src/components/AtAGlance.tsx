import type { NutrientBar } from "../api/types";
import { barColor } from "../scan/grade";
import styles from "./AtAGlance.module.css";

/** Compact, always-visible nutrient strip: one mini-bar per key nutrient so the
 *  important numbers aren't hidden behind a "see breakdown" expander. */
export function AtAGlance({ nutrients }: { nutrients: NutrientBar[] }) {
  if (nutrients.length === 0) return null;
  return (
    <div className={styles.wrap}>
      <div className={styles.label}>At a glance · per 100g</div>
      <div className={styles.grid}>
        {nutrients.map((n) => (
          <div className={styles.cell} key={n.key}>
            <div className={styles.top}>
              <span className={styles.name}>{n.label}</span>
              <span className={styles.level} style={{ color: barColor(n.level, n.high_is_bad) }}>
                {n.level}
              </span>
            </div>
            <div className={styles.value}>{n.value_g}<span className={styles.unit}>g</span></div>
            <div className={styles.bar}>
              <i style={{ width: `${Math.max(4, n.pct)}%`, background: barColor(n.level, n.high_is_bad) }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
