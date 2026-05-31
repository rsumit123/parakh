import { useRef } from "react";
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

  const { busy, error, runBarcode, runPhoto } = useScan({
    token, onResult, onAuthError, scanByBarcode, scanByPhoto,
  });

  // Camera stays off while a scan is processing (busy) so it doesn't fight the overlay.
  const { error: cameraError } = useBarcodeScanner({
    videoRef,
    enabled: !busy,
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

      <div className={styles.viewfinder}>
        <video ref={videoRef} muted playsInline />
        <div className={styles.frame} />
        <div className={styles.hint}>Line up the barcode to scan</div>
      </div>

      <div className={styles.actions}>
        {error && <div className={styles.err}>{error}</div>}
        {cameraError && !error && <div className={styles.err}>{cameraError}</div>}

        <div className={styles.divider}>can't scan? add a label photo</div>
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
