import { useEffect, useRef, useState } from "react";
import { estimateMeal, type MealEstimate } from "../api/diet";
import { ApiError } from "../api/client";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { LimitModal } from "../components/LimitModal";
import styles from "./MealCaptureScreen.module.css";

export function MealCaptureScreen({ token, onEstimated, onBack }: {
  token: string; onEstimated: (est: MealEstimate, imageUrl: string) => void; onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camReady, setCamReady] = useState(false);
  const [camFailed, setCamFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [limitReached, setLimitReached] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) return;
    md.getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
        setCamReady(true);
      })
      .catch(() => { setCamReady(false); setCamFailed(true); });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Re-attach the live stream to the <video> after it remounts (e.g. when `busy`
  // cleared on a failed estimate, the LoadingOverlay early-return swapped the node out).
  useEffect(() => {
    if (!busy && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {});
    }
  }, [busy]);

  const runEstimate = async (blob: Blob) => {
    setBusy(true);
    setError(false);
    const url = URL.createObjectURL(blob);
    try {
      const file = new File([blob], "meal.jpg", { type: "image/jpeg" });
      const est = await estimateMeal(token, file);
      streamRef.current?.getTracks().forEach((t) => t.stop());  // free the camera before leaving
      streamRef.current = null;
      onEstimated(est, url);
    } catch (e) {
      URL.revokeObjectURL(url);
      // A 429 here is the shared daily scan quota, not an unreadable photo — show
      // the same "limit reached" dialog the barcode scanner uses.
      if (e instanceof ApiError && e.status === 429) setLimitReached(true);
      else setError(true);
      setBusy(false);
    }
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    // Downscale to ~1280px so the encode + upload stay fast on phones (the estimator
    // doesn't need full sensor resolution).
    const scale = Math.min(1, 1280 / v.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    // Show the loader immediately so the tap feels instant (the encode happens next).
    setBusy(true);
    setError(false);
    canvas.toBlob((b) => { if (b) void runEstimate(b); else { setError(true); setBusy(false); } }, "image/jpeg", 0.85);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void runEstimate(f);
  };

  if (busy) return <LoadingOverlay />;

  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <button className={styles.back} onClick={onBack} aria-label="Back">←</button>
        <div className={styles.logo}>Par<b>akh</b></div>
        <span style={{ width: 34 }} />
      </div>
      <div className={styles.viewfinder}>
        <video ref={videoRef} autoPlay muted playsInline />
        {!camReady && !camFailed && <div className={styles.noCam}>Starting camera…</div>}
        {camFailed && <div className={styles.noCam}>Camera unavailable — choose a photo below.</div>}
        {camReady && <div className={styles.hint}>Fit your plate in the frame</div>}
      </div>
      <div className={styles.actions}>
        {error && <div className={styles.err}>Couldn't spot food in that photo. Try another, or add it by search.</div>}
        <button className={styles.shutter} onClick={capture} disabled={!camReady} data-testid="meal-capture">
          Capture meal
        </button>
        <label className={styles.gallery} aria-label="Choose a meal photo from gallery">
          🖼 Choose from gallery
          <input className={styles.hidden} type="file" accept="image/*" data-testid="meal-gallery" onChange={onFile} />
        </label>
      </div>
      <LimitModal open={limitReached} isGuest={false}
        onClose={() => setLimitReached(false)} onSignIn={() => setLimitReached(false)} />
    </div>
  );
}
