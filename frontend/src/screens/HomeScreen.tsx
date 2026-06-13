import { useState } from "react";
import type { Product } from "../api/types";
import { LimitModal } from "../components/LimitModal";
import { RecentScans } from "../components/RecentScans";
import type { HistoryEntry } from "../session/history";
import styles from "./HomeScreen.module.css";

interface Props {
  remaining?: number;
  isGuest: boolean;
  history: HistoryEntry[];
  onOpenCamera: () => void;
  onOpenProduct: (p: Product) => void;
  onSeeHistory: () => void;
  onSignIn: () => void;
  onSnapMeal: () => void;
}

export function HomeScreen({
  remaining, isGuest, history, onOpenCamera, onOpenProduct, onSeeHistory, onSignIn, onSnapMeal,
}: Props) {
  const [showLimit, setShowLimit] = useState(false);
  const atLimit = remaining === 0;

  const startScan = () => {
    if (atLimit) { setShowLimit(true); return; }
    onOpenCamera();
  };

  const startSnapMeal = () => {
    if (atLimit) { setShowLimit(true); return; }
    onSnapMeal();
  };

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <div className={styles.brandRow}>
          <div className={styles.logo}>Par<b>akh</b></div>
        </div>
        <h1 className={styles.headline}>What are you eating?</h1>
        <p className={styles.tagline}>
          Point your camera at any pack — we'll grade it.
          {remaining !== undefined && <> · <b className={styles.left}>{remaining} scans left today</b></>}
        </p>
      </div>

      <div className={styles.actions}>
        <button className={`${styles.card} ${styles.primary}`} onClick={startScan}>
          <span className={styles.icon}>📷</span>
          <span className={styles.cardText}>
            <span className={styles.cardTitle}>Scan a product</span>
            <span className={styles.cardSub}>Barcode or label — we figure it out</span>
          </span>
        </button>
        <button className={styles.card} onClick={startSnapMeal}>
          <span className={styles.icon}>🍽</span>
          <span className={styles.cardText}>
            <span className={styles.cardTitle}>Snap a meal</span>
            <span className={styles.cardSub}>Cooked or fresh food, no barcode needed</span>
          </span>
        </button>
      </div>

      <RecentScans entries={history} onOpen={onOpenProduct} onSeeAll={onSeeHistory} />

      <LimitModal
        open={showLimit}
        isGuest={isGuest}
        onClose={() => setShowLimit(false)}
        onSignIn={onSignIn}
      />
    </div>
  );
}
