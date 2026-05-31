import { useRef, useState } from "react";
import type { ScanResult } from "../api/types";
import { useScan } from "../scan/useScan";
import { useBarcodeScanner } from "../scan/useBarcodeScanner";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { LimitModal } from "../components/LimitModal";
import styles from "./ScanScreen.module.css";

interface Props {
  token: string;
  remaining?: number;
  isGuest: boolean;
  onResult: (r: ScanResult) => void;
  onBack: () => void;
  onSignIn: () => void;
  onAuthError?: () => void;
  // injectable for tests
  scanByBarcode?: (barcode: string, token: string) => Promise<ScanResult>;
  scanByPhoto?: (barcode: string, image: Blob, token: string) => Promise<ScanResult>;
}

export function ScanScreen({
  token, remaining, isGuest, onResult, onBack, onSignIn, onAuthError, scanByBarcode, scanByPhoto,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Set when a scanned barcode isn't in any database — we ask for a label photo
  // and pause the live scanner so it doesn't keep re-reading the same code.
  const [needsPhoto, setNeedsPhoto] = useState(false);

  const { busy, error, limitReached, runBarcode, runPhoto, clearLimit } = useScan({
    token, onResult, onAuthError, scanByBarcode, scanByPhoto,
    onNeedsPhoto: () => setNeedsPhoto(true),
  });

  // Camera off while processing, in the photo fallback, or when out of scans.
  const { error: cameraError } = useBarcodeScanner({
    videoRef,
    enabled: !busy && !needsPhoto && !limitReached,
    onScan: (code) => void runBarcode(code),
  });

  if (busy) return <LoadingOverlay />;

  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <button className={styles.back} onClick={onBack} aria-label="Back">←</button>
        <div className={styles.logo}>Par<b>akh</b></div>
        {remaining !== undefined ? (
          <div className={styles.pill}>{remaining} left</div>
        ) : <span style={{ width: 34 }} />}
      </div>

      {!needsPhoto && (
        <div className={styles.viewfinder}>
          <video ref={videoRef} muted playsInline />
          <div className={styles.frame} />
          <div className={styles.hint}>Line up the barcode to scan</div>
        </div>
      )}

      <div className={styles.actions}>
        {needsPhoto && (
          <div className={styles.notice}>
            <b>We don't know this product yet.</b>
            <span>Snap or upload a photo of the nutrition label and we'll read it.</span>
            <button className={styles.retry} onClick={() => setNeedsPhoto(false)}>
              ← Scan a different barcode
            </button>
          </div>
        )}
        {error && <div className={styles.err}>{error}</div>}
        {cameraError && !error && !needsPhoto && <div className={styles.err}>{cameraError}</div>}

        {!needsPhoto && <div className={styles.divider}>can't scan? add a label photo</div>}
        <label className={`${styles.btn} ${styles.lime}`}>
          🖼 Upload label from gallery
          <input
            data-testid="scan-upload"
            className={styles.hidden}
            type="file"
            accept="image/*"
            onChange={(e) => runPhoto(e.target.files?.[0])}
          />
        </label>
        <label className={`${styles.btn} ${styles.ghost}`}>
          📷 Take a label photo
          <input
            data-testid="scan-capture"
            className={styles.hidden}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => runPhoto(e.target.files?.[0])}
          />
        </label>
      </div>

      <LimitModal
        open={limitReached}
        isGuest={isGuest}
        onClose={clearLimit}
        onSignIn={onSignIn}
      />
    </div>
  );
}
