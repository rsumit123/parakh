import { useRef, useState } from "react";
import type { ScanResult } from "../api/types";
import {
  scanBarcode as defaultScanBarcode,
  scanPhoto as defaultScanPhoto,
  NeedsPhotoError,
  RateLimitError,
  UnreadableLabelError,
} from "../scan/scanApi";
import { useBarcodeScanner } from "../scan/useBarcodeScanner";
import styles from "./ScanScreen.module.css";

interface Props {
  token: string;
  remaining?: number;
  onResult: (r: ScanResult) => void;
  scanByBarcode?: (barcode: string, token: string) => Promise<ScanResult>;
  scanByPhoto?: (barcode: string, image: Blob, token: string) => Promise<ScanResult>;
}

export function ScanScreen({
  token, remaining, onResult,
  scanByBarcode = defaultScanBarcode,
  scanByPhoto = defaultScanPhoto,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState("");
  const [needsPhoto, setNeedsPhoto] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleError = (e: unknown) => {
    if (e instanceof NeedsPhotoError) {
      setNeedsPhoto(true);
      setError(null);
    } else if (e instanceof RateLimitError) {
      setError("You've hit your daily scan limit. Sign in or come back tomorrow.");
    } else if (e instanceof UnreadableLabelError) {
      setError("We couldn't read that label. Try a clearer photo of the nutrition panel.");
    } else {
      setError("Something went wrong. Please try again.");
    }
  };

  const runBarcode = async (barcode: string) => {
    if (!barcode || busy) return;
    setBusy(true);
    setError(null);
    setPendingBarcode(barcode);
    try {
      onResult(await scanByBarcode(barcode, token));
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const onPhotoPicked = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      onResult(await scanByPhoto(pendingBarcode ?? manual ?? "unknown", file, token));
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  useBarcodeScanner({
    videoRef,
    enabled: !needsPhoto,
    onScan: (code) => void runBarcode(code),
  });

  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <div className={styles.logo}>Par<b>akh</b></div>
        {remaining !== undefined && <div className={styles.pill}>{remaining} scans left today</div>}
      </div>

      <div className={styles.viewfinder}>
        <video ref={videoRef} muted playsInline />
        <div className={styles.frame} />
        <div className={styles.hint}>Line up the barcode to scan</div>
      </div>

      <div className={styles.actions}>
        {busy && <div className={styles.busy}>Scanning…</div>}
        {error && <div className={styles.err}>{error}</div>}

        {needsPhoto ? (
          <>
            <div className={styles.photoPrompt}>
              We don't know this product yet — photograph the nutrition label and we'll read it.
            </div>
            <label className={`${styles.btn} ${styles.lime}`} style={{ display: "block", textAlign: "center" }}>
              📷 Take a photo of the label
              <input
                data-testid="photo-input"
                className={styles.hidden}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => onPhotoPicked(e.target.files?.[0])}
              />
            </label>
          </>
        ) : (
          <>
            <div className={styles.row}>
              <input
                className={styles.input}
                placeholder="Enter barcode"
                value={manual}
                inputMode="numeric"
                onChange={(e) => setManual(e.target.value)}
              />
              <button className={`${styles.btn} ${styles.lime}`} onClick={() => runBarcode(manual)}>
                Look up
              </button>
            </div>
            <label className={`${styles.btn} ${styles.ghost}`} style={{ textAlign: "center" }}>
              📷 Photograph the label instead
              <input
                data-testid="photo-input"
                className={styles.hidden}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => onPhotoPicked(e.target.files?.[0])}
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}
