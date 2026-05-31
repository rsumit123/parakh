import { useRef, useState } from "react";
import type { ScanResult } from "../api/types";
import { useScan } from "../scan/useScan";
import { LoadingOverlay } from "../components/LoadingOverlay";
import styles from "./HomeScreen.module.css";

interface Props {
  token: string;
  remaining?: number;
  onResult: (r: ScanResult) => void;
  onOpenCamera: () => void;
  onAuthError?: () => void;
  // injectable for tests
  scanByBarcode?: (barcode: string, token: string) => Promise<ScanResult>;
  scanByPhoto?: (barcode: string, image: Blob, token: string) => Promise<ScanResult>;
}

export function HomeScreen({
  token, remaining, onResult, onOpenCamera, onAuthError,
  scanByBarcode, scanByPhoto,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState("");

  const { busy, error, runBarcode, runPhoto } = useScan({
    token, onResult, onAuthError, scanByBarcode, scanByPhoto,
  });

  if (busy) return <LoadingOverlay />;

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <div className={styles.brandRow}>
          <div className={styles.logo}>Par<b>akh</b></div>
          {remaining !== undefined && (
            <div className={styles.pill}>{remaining} scans left today</div>
          )}
        </div>
        <h1 className={styles.headline}>What are you eating?</h1>
        <p className={styles.tagline}>Scan a barcode or a label — we'll grade it for you.</p>
      </div>

      <div className={styles.actions}>
        {error && <div className={styles.err}>{error}</div>}

        <button className={`${styles.card} ${styles.primary}`} onClick={onOpenCamera}>
          <span className={styles.icon}>📷</span>
          <span className={styles.cardText}>
            <span className={styles.cardTitle}>Scan barcode</span>
            <span className={styles.cardSub}>Point your camera at the pack</span>
          </span>
        </button>

        <button className={styles.card} onClick={() => fileRef.current?.click()}>
          <span className={styles.icon}>🖼</span>
          <span className={styles.cardText}>
            <span className={styles.cardTitle}>Upload label photo</span>
            <span className={styles.cardSub}>Pick a nutrition-label photo from your gallery</span>
          </span>
        </button>
        <input
          ref={fileRef}
          data-testid="home-upload"
          className={styles.hidden}
          type="file"
          accept="image/*"
          onChange={(e) => runPhoto(e.target.files?.[0])}
        />

        {showManual ? (
          <div className={styles.manualRow}>
            <input
              className={styles.input}
              placeholder="Enter barcode number"
              value={manual}
              inputMode="numeric"
              autoFocus
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runBarcode(manual); }}
            />
            <button className={styles.go} onClick={() => runBarcode(manual)}>Go</button>
          </div>
        ) : (
          <button className={styles.card} onClick={() => setShowManual(true)}>
            <span className={styles.icon}>#</span>
            <span className={styles.cardText}>
              <span className={styles.cardTitle}>Enter barcode</span>
              <span className={styles.cardSub}>Type the number under the barcode</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
