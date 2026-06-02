import styles from "./LoadingOverlay.module.css";

// A QR-ish 7x7 pattern (1 = filled) with finder blocks in three corners.
const QR = [
  1, 1, 1, 0, 1, 1, 1,
  1, 0, 1, 0, 0, 0, 1,
  1, 0, 1, 1, 1, 0, 1,
  0, 0, 0, 1, 0, 1, 0,
  1, 1, 0, 1, 1, 0, 1,
  1, 0, 0, 0, 1, 0, 0,
  1, 1, 1, 0, 1, 1, 1,
];

/** Full-screen processing state shown while a scan is in flight: a QR-scan
 *  animation (a lime line sweeping over a QR motif). */
export function LoadingOverlay({ message = "Parakhing your food…" }: { message?: string }) {
  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <div className={styles.qr} aria-hidden="true">
        <div className={styles.grid}>
          {QR.map((c, i) => (
            <span key={i} className={c ? styles.on : undefined} />
          ))}
        </div>
        <span className={styles.sweep} />
        <span className={styles.line} />
      </div>
      <p className={styles.msg}>{message}</p>
      <p className={styles.sub}>Reading the label &amp; scoring it</p>
    </div>
  );
}
