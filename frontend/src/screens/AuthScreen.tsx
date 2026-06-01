import { useEffect, useRef, useState } from "react";
import styles from "./AuthScreen.module.css";

interface Props {
  onGuest: () => Promise<void> | void;
  onGoogleLogin: (credential: string) => Promise<void> | void;
}

interface GoogleId {
  initialize: (cfg: {
    client_id: string;
    callback: (r: { credential?: string }) => void;
  }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

export function AuthScreen({ onGuest, onGoogleLogin }: Props) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) return;
    let cancelled = false;

    const tryRender = (): boolean => {
      const id = window.google?.accounts?.id;
      if (!id) return false;
      id.initialize({
        client_id: clientId,
        callback: (resp) => {
          if (resp.credential) {
            Promise.resolve(onGoogleLogin(resp.credential)).catch(() =>
              setError("We couldn't sign you in. Try again."),
            );
          }
        },
      });
      if (btnRef.current) {
        id.renderButton(btnRef.current, {
          type: "standard",
          theme: "outline",
          shape: "pill",
          size: "large",
          text: "continue_with",
          width: 280,
        });
      }
      return true;
    };

    if (tryRender()) return;
    const interval = setInterval(() => {
      if (cancelled || tryRender()) clearInterval(interval);
    }, 200);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [onGoogleLogin]);

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
      <div className={styles.brand}>
        <span className={styles.leaf}>P</span>
        <span className={styles.wordmark}>
          Par<b>akh</b>
        </span>
      </div>

      <div className={styles.hero}>
        <div className={styles.art}>
          <span className={`${styles.corner} ${styles.c1}`} />
          <span className={`${styles.corner} ${styles.c2}`} />
          <span className={`${styles.corner} ${styles.c3}`} />
          <span className={`${styles.corner} ${styles.c4}`} />
          <span className={styles.beam} />
          <span className={styles.emoji} role="img" aria-label="canned food">
            🥫
          </span>
        </div>
        <h1 className={styles.headline}>
          Know what's
          <br />
          really in your food.
        </h1>
        <p className={styles.tagline}>
          Scan a pack and get one honest A–E health score in seconds.
        </p>
      </div>

      <div className={styles.auth}>
        <div className={styles.gbtnWrap}>
          <div ref={btnRef} data-testid="google-signin-btn" />
        </div>
        <div className={styles.divider}>or</div>
        <button className={styles.guest} disabled={busy} onClick={doGuest}>
          Just looking? <b>Continue as guest →</b>
        </button>
        {error && <div className={styles.err}>{error}</div>}
      </div>
    </div>
  );
}
