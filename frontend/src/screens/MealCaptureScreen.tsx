import { useEffect, useRef, useState } from "react";
import { estimateMeal, type MealEstimate } from "../api/diet";
import { LoadingOverlay } from "../components/LoadingOverlay";
import styles from "./MealCaptureScreen.module.css";

export function MealCaptureScreen({ token, onEstimated, onBack }: {
  token: string; onEstimated: (est: MealEstimate) => void; onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camReady, setCamReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

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
      .catch(() => setCamReady(false));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const runEstimate = async (blob: Blob) => {
    setBusy(true);
    setError(false);
    try {
      const file = new File([blob], "meal.jpg", { type: "image/jpeg" });
      const est = await estimateMeal(token, file);
      streamRef.current?.getTracks().forEach((t) => t.stop());  // free the camera before leaving
      onEstimated(est);
    } catch {
      setError(true);
      setBusy(false);
    }
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((b) => { if (b) void runEstimate(b); }, "image/jpeg", 0.9);
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
        <video ref={videoRef} muted playsInline />
        {!camReady && <div className={styles.noCam}>Camera unavailable — choose a photo below.</div>}
        {camReady && <div className={styles.hint}>Fit your plate in the frame</div>}
      </div>
      <div className={styles.actions}>
        {error && <div className={styles.err}>Couldn't read that photo — try another.</div>}
        <button className={styles.shutter} onClick={capture} disabled={!camReady} data-testid="meal-capture">
          Capture meal
        </button>
        <label className={styles.gallery}>
          🖼 Choose from gallery
          <input className={styles.hidden} type="file" accept="image/*" data-testid="meal-gallery" onChange={onFile} />
        </label>
      </div>
    </div>
  );
}
