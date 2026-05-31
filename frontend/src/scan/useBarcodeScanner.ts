import { useEffect, useState, type RefObject } from "react";

// Minimal structural type for the ZXing reader so we can inject a fake in tests.
export interface ZxingResultLike {
  getText(): string;
}
export interface ZxingControls {
  stop(): void;
}
export interface ZxingReader {
  decodeFromVideoDevice(
    deviceId: string | undefined,
    video: HTMLVideoElement,
    callback: (result: ZxingResultLike | undefined, err: unknown) => void,
  ): Promise<ZxingControls>;
}

interface Options {
  videoRef: RefObject<HTMLVideoElement>;
  enabled: boolean;
  onScan: (barcode: string) => void;
  makeReader?: () => ZxingReader;
}

async function defaultReader(): Promise<ZxingReader> {
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  return new BrowserMultiFormatReader() as unknown as ZxingReader;
}

export function useBarcodeScanner({ videoRef, enabled, onScan, makeReader }: Options) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !videoRef.current) return;
    let controls: ZxingControls | null = null;
    let cancelled = false;

    const start = async () => {
      try {
        const reader = makeReader ? makeReader() : await defaultReader();
        if (cancelled || !videoRef.current) return;
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result) onScan(result.getText());
        });
      } catch {
        setError("Camera unavailable. You can still photograph the label.");
      }
    };
    void start();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [enabled, videoRef, onScan, makeReader]);

  return { error };
}
