import type { Grade } from "../api/types";
import styles from "./ScoreRing.module.css";

export function ScoreRing({ grade, overall }: { grade: Grade; overall: number }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.ring}>
        <span className={styles.grade}>{grade}</span>
      </div>
      <div className={styles.pill}>{overall} / 100</div>
    </div>
  );
}
