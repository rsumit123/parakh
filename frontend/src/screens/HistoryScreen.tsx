import type { HistoryEntry } from "../session/history";
import type { Product } from "../api/types";
import { gradeTone } from "../scan/grade";
import styles from "./HistoryScreen.module.css";

interface Props {
  entries: HistoryEntry[];
  onBack: () => void;
  onOpen: (product: Product) => void;
  onClear: () => void;
}

export function HistoryScreen({ entries, onBack, onOpen, onClear }: Props) {
  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <button className={styles.back} onClick={onBack} aria-label="Back">←</button>
        <h2 className={styles.title}>Scan history</h2>
        {entries.length > 0
          ? <button className={styles.clear} onClick={onClear}>Clear</button>
          : <span style={{ width: 44 }} />}
      </div>

      {entries.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🍽</div>
          <p className={styles.emptyTitle}>No scans yet</p>
          <p className={styles.emptySub}>Products you scan will show up here.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {entries.map((e) => {
            const tone = gradeTone(e.product.score.grade);
            return (
              <button key={`${e.product.barcode}-${e.at}`} className={styles.row} onClick={() => onOpen(e.product)}>
                <span className={`${styles.grade} ${styles[tone]}`}>{e.product.score.grade}</span>
                <span className={styles.info}>
                  <span className={styles.name}>{e.product.name || "Unknown product"}</span>
                  <span className={styles.meta}>{e.product.brand || e.product.barcode} · {e.product.score.overall}/100</span>
                </span>
                <span className={styles.chev}>›</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
