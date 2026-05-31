import { useState } from "react";
import type { Product } from "../api/types";
import { gradeTone } from "../scan/grade";
import { ScoreRing } from "../components/ScoreRing";
import { Breakdown } from "./Breakdown";
import styles from "./ResultScreen.module.css";

export function ResultScreen({ product, onScanAgain }: { product: Product; onScanAgain: () => void }) {
  const [open, setOpen] = useState(false);
  const { score } = product;
  const tone = gradeTone(score.grade);

  return (
    <div className={styles.screen}>
      <div className={`${styles.hero} ${styles[tone]}`}>
        <ScoreRing grade={score.grade} overall={score.overall} />
        <div className={styles.verdict}>{score.verdict}</div>
        <div className={styles.sub}>{product.source === "db" ? "From your scans" : "Freshly scored"}</div>
      </div>

      <div className={styles.prod}>
        <div>
          <h3>{product.name || "Unknown product"}</h3>
          <p>{product.brand || product.barcode}</p>
        </div>
      </div>

      <div className={styles.reasons}>
        {score.positives.map((p) => (
          <div className={`${styles.reason} ${styles.pos}`} key={`p-${p}`}>
            <div className={styles.ic}>✓</div>
            <span>{p}</span>
          </div>
        ))}
        {score.negatives.map((n) => (
          <div className={`${styles.reason} ${styles.neg}`} key={`n-${n}`}>
            <div className={styles.ic}>!</div>
            <span>{n}</span>
          </div>
        ))}
      </div>

      <button className={styles.toggle} onClick={() => setOpen((v) => !v)}>
        {open ? "▴ Hide breakdown" : "▾ See full breakdown"}
      </button>
      {open && (
        <div className={styles.detail}>
          <Breakdown score={score} />
        </div>
      )}

      <button className={styles.again} onClick={onScanAgain}>Scan another</button>
    </div>
  );
}
