import type { Score } from "../api/types";
import { barColor } from "../scan/grade";
import styles from "./Breakdown.module.css";

export function Breakdown({ score }: { score: Score }) {
  const { nutrients, india_flags } = score.breakdown;
  return (
    <div>
      <div className={styles.section}>
        <p className={styles.secT}>Per 100g</p>
        {nutrients.map((n) => (
          <div className={styles.nut} key={n.key}>
            <div className={styles.nl}>
              <span>{n.label}</span>
              <span className={styles.val}>{n.value_g}g · {n.level}</span>
            </div>
            <div className={styles.bar}>
              <i style={{ width: `${n.pct}%`, background: barColor(n.level, n.high_is_bad) }} />
            </div>
          </div>
        ))}
      </div>

      {india_flags.length > 0 && (
        <div className={styles.section}>
          <p className={styles.secT}>India flags</p>
          {india_flags.map((f) => (
            <div className={styles.flag} key={f.label}>
              <div className={styles.ic}>!</div>
              <div>
                <h4>{f.label}</h4>
                <p>{f.note}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
