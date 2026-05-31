import { useState } from "react";
import styles from "./AuthScreen.module.css";

interface Props {
  onGuest: () => Promise<void> | void;
  onEmailLogin: (email: string) => Promise<void> | void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthScreen({ onGuest, onEmailLogin }: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitEmail = async () => {
    if (!EMAIL_RE.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onEmailLogin(email);
    } catch {
      setError("We couldn't sign you in. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const doGuest = async () => {
    setError(null);
    setBusy(true);
    try {
      await onGuest();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <div className={styles.mark}>P</div>
        <h1>Know what's<br />in your food.</h1>
        <p>Scan, get a clear score, shop smarter. No spreadsheets, no guilt.</p>
      </div>
      <div className={styles.sheet}>
        <input
          className={styles.input}
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <button className={`${styles.btn} ${styles.dark}`} disabled={busy} onClick={submitEmail}>
          Continue with email
        </button>
        <button className={styles.guest} disabled={busy} onClick={doGuest}>
          Just looking? <b>Continue as guest →</b>
        </button>
        {error && <div className={styles.err}>{error}</div>}
        <div className={styles.note}>Guest: 3 scans/day · Free account: 10 scans/day</div>
      </div>
    </div>
  );
}
