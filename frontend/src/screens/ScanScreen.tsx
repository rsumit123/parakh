import { useCallback, useRef, useState } from "react";
import type { ScanResult } from "../api/types";
import {
  scanBarcode as defaultScanBarcode,
  scanPhoto as defaultScanPhoto,
  NeedsPhotoError,
  RateLimitError,
  UnreadableLabelError,
  AuthExpiredError,
} from "../scan/scanApi";
import { useBarcodeScanner } from "../scan/useBarcodeScanner";
import styles from "./ScanScreen.module.css";

interface Props {
  token: string;
  remaining?: number;
  onResult: (r: ScanResult) => void;
  onAuthError?: () => void;
  scanByBarcode?: (barcode: string, token: string) => Promise<ScanResult>;
  scanByPhoto?: (barcode: string, image: Blob, token: string) => Promise<ScanResult>;
}

export function ScanScreen({
  token, remaining, onResult, onAuthError,
  scanByBarcode = defaultScanBarcode,
  scanByPhoto = defaultScanPhoto,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState("");
  const [needsPhoto, setNeedsPhoto] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof AuthExpiredError) {
      onAuthError?.();
    } else if (e instanceof NeedsPhotoError) {
      setNeedsPhoto(true);
      setError(null);
    } else if (e instanceof RateLimitError) {
      setError("You've hit your daily scan limit. Sign in or come back tomorrow.");
    } else if (e instanceof UnreadableLabelError) {
      setError("We couldn't read that label. Try a clearer photo of the nutrition panel.");
    } else {
      setError("Something went wrong. Please try again.");
    }
  }, [onAuthError]);

  const runBarcode = useCallback(async (barcode: string) => {
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
  }, [busy, onResult, scanByBarcode, token, handleError]);

  const onPhotoPicked = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Key the cached product by the barcode if we have one; otherwise this is a
      // label-only upload, so mint a unique key so each upload is its own record
      // (rather than every barcode-less scan overwriting a shared "unknown" entry).
      const barcodeForPhoto =
        pendingBarcode || manual || `label-${crypto.randomUUID?.() ?? Date.now()}`;
      onResult(await scanByPhoto(barcodeForPhoto, file, token));
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  // Renders the two ways to add a label photo: live camera (capture) and gallery
  // upload (no capture, so the OS file picker can offer existing images).
  const photoButtons = (idSuffix: string) => (
    <>
      <label className={`${styles.btn} ${styles.lime}`} style={{ display: "block", textAlign: "center" }}>
        📷 Take a photo
        <input
          data-testid={`photo-input-${idSuffix}`}
          className={styles.hidden}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={(e) => onPhotoPicked(e.target.files?.[0])}
        />
      </label>
      <label className={`${styles.btn} ${styles.ghost}`} style={{ display: "block", textAlign: "center" }}>
        🖼 Upload from gallery
        <input
          data-testid={`photo-upload-${idSuffix}`}
          className={styles.hidden}
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(e) => onPhotoPicked(e.target.files?.[0])}
        />
      </label>
    </>
  );

  const onScan = useCallback((code: string) => void runBarcode(code), [runBarcode]);

  const { error: cameraError } = useBarcodeScanner({
    videoRef,
    enabled: !needsPhoto,
    onScan,
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
        {cameraError && !error && <div className={styles.err}>{cameraError}</div>}

        {needsPhoto ? (
          <>
            <div className={styles.photoPrompt}>
              We don't know this product yet — add a photo of the nutrition label
              (take one or upload from your gallery) and we'll read it.
            </div>
            {photoButtons("needs-photo")}
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
            <div className={styles.divider}>or add a label photo</div>
            {photoButtons("bypass")}
          </>
        )}
      </div>
    </div>
  );
}
