import type { HistoryEntry } from "../session/history";
import type { Product } from "../api/types";
import { gradeTone } from "../scan/grade";
import styles from "./RecentScans.module.css";

interface Props {
  entries: HistoryEntry[];
  onOpen: (product: Product) => void;
  onSeeAll: () => void;
}

/** A compact preview of the most recent scans, shown on the Home screen. Renders a
 *  friendly empty state (filling the page) when there's no history yet. */
export function RecentScans({ entries, onOpen, onSeeAll }: Props) {
  if (entries.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>🛒</div>
        <p className={styles.emptyText}>Your scanned products will appear here.</p>
        <p className={styles.emptyHint}>Tip: the label photo reads the most detail.</p>
      </div>
    );
  }

  const preview = entries.slice(0, 4);
  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.title}>Recent scans</span>
        {entries.length > preview.length && (
          <button className={styles.seeAll} onClick={onSeeAll}>See all</button>
        )}
      </div>
      <div className={styles.list}>
        {preview.map((e) => {
          const tone = gradeTone(e.product.score.grade);
          return (
            <button key={`${e.product.barcode}-${e.at}`} className={styles.row} onClick={() => onOpen(e.product)}>
              <span className={`${styles.grade} ${styles[tone]}`}>{e.product.score.grade}</span>
              <span className={styles.info}>
                <span className={styles.name}>{e.product.name || "Unknown product"}</span>
                <span className={styles.meta}>{e.product.score.overall}/100</span>
              </span>
              <span className={styles.chev}>›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
