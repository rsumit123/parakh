import { useRef, useState } from "react";
import type { ScanResult } from "../api/types";
import { useScan } from "../scan/useScan";
import { useBarcodeScanner } from "../scan/useBarcodeScanner";
import { LoadingOverlay } from "../components/LoadingOverlay";
import styles from "./ScanScreen.module.css";

interface Props {
  token: string;
  remaining?: number;
  onResult: (r: ScanResult) => void;
  onBack: () => void;
  onAuthError?: () => void;
  // injectable for tests
  scanByBarcode?: (barcode: string, token: string) => Promise<ScanResult>;
  scanByPhoto?: (barcode: string, image: Blob, token: string) => Promise<ScanResult>;
}

export function ScanScreen({
  token, remaining, onResult, onBack, onAuthError, scanByBarcode, scanByPhoto,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Set when a scanned barcode isn't in any database — we ask for a label photo
  // and pause the live scanner so it doesn't keep re-reading the same code.
  const [needsPhoto, setNeedsPhoto] = useState(false);

  const { busy, error, runBarcode, runPhoto } = useScan({
    token, onResult, onAuthError, scanByBarcode, scanByPhoto,
    onNeedsPhoto: () => setNeedsPhoto(true),
  });

  // Camera off while processing (busy) or once we've fallen back to the photo flow.
  const { error: cameraError } = useBarcodeScanner({
    videoRef,
    enabled: !busy && !needsPhoto,
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
    </div>
  );
}
