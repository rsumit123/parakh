import styles from "./LoadingOverlay.module.css";

/** Full-screen processing state shown while a scan is in flight. */
export function LoadingOverlay({ message = "Parakhing your food…" }: { message?: string }) {
  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <div className={styles.bowl}>
        <span className={styles.ring} />
        <span className={styles.mark}>P</span>
      </div>
      <p className={styles.msg}>{message}</p>
      <p className={styles.sub}>Reading the label &amp; scoring it</p>
    </div>
  );
}
