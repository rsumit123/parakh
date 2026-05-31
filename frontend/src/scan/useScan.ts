import { useCallback, useState } from "react";
import type { ScanResult } from "../api/types";
import {
  scanBarcode as defaultScanBarcode,
  scanPhoto as defaultScanPhoto,
  NeedsPhotoError,
  RateLimitError,
  UnreadableLabelError,
  AuthExpiredError,
} from "./scanApi";

interface Options {
  token: string;
  onResult: (r: ScanResult) => void;
  onAuthError?: () => void;
  onNeedsPhoto?: () => void;
  scanByBarcode?: (barcode: string, token: string) => Promise<ScanResult>;
  scanByPhoto?: (barcode: string, image: Blob, token: string) => Promise<ScanResult>;
}

/** Orchestrates scan calls + the shared busy/error state so any screen (Home, Scan)
 *  can trigger a barcode or photo scan and render a consistent loading/error UX. */
export function useScan({
  token, onResult, onAuthError, onNeedsPhoto,
  scanByBarcode = defaultScanBarcode,
  scanByPhoto = defaultScanPhoto,
}: Options) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((e: unknown): void => {
    if (e instanceof AuthExpiredError) {
      onAuthError?.();
    } else if (e instanceof NeedsPhotoError) {
      setError(null);
      onNeedsPhoto?.();
    } else if (e instanceof RateLimitError) {
      setError("You've hit your daily scan limit. Sign in or come back tomorrow.");
    } else if (e instanceof UnreadableLabelError) {
      setError("We couldn't read that label. Try a clearer photo of the nutrition panel.");
    } else {
      setError("Something went wrong. Please try again.");
    }
  }, [onAuthError, onNeedsPhoto]);

  const runBarcode = useCallback(async (barcode: string): Promise<void> => {
    if (!barcode || busy) return;
    setBusy(true);
    setError(null);
    try {
      onResult(await scanByBarcode(barcode, token));
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }, [busy, onResult, scanByBarcode, token, handleError]);

  const runPhoto = useCallback(async (file: File | undefined, barcode?: string): Promise<void> => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Key by the barcode if known; otherwise mint a unique key so each label-only
      // upload is its own cached record rather than overwriting a shared one.
      const key = barcode || `label-${crypto.randomUUID?.() ?? Date.now()}`;
      onResult(await scanByPhoto(key, file, token));
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }, [busy, onResult, scanByPhoto, token, handleError]);

  const clearError = useCallback(() => setError(null), []);

  return { busy, error, runBarcode, runPhoto, clearError };
}
