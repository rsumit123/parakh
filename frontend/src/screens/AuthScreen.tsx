import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import styles from "./AuthScreen.module.css";

interface Props {
  onGuest: () => Promise<void> | void;
  onGoogleLogin: (credential: string) => Promise<void> | void;
}

// In a Capacitor WebView Google blocks the web GIS flow (disallowed_useragent),
// so native builds use the native Google Sign-In plugin instead. Both paths send
// the same ID token to POST /auth/google (audience = our web client id).
const isNative = Capacitor.isNativePlatform();

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
  const [signingIn, setSigningIn] = useState(false);

  // Native Google Sign-In (Capacitor): initialize the plugin once on mount.
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!isNative || !clientId) return;
    void import("@codetrix-studio/capacitor-google-auth").then(({ GoogleAuth }) => {
      GoogleAuth.initialize({
        clientId,
        scopes: ["profile", "email"],
        grantOfflineAccess: false,
      });
    });
  }, []);

  const doNativeGoogle = async () => {
    setError(null);
    setSigningIn(true);
    try {
      const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");
      const user = await GoogleAuth.signIn();
      const idToken = user?.authentication?.idToken;
      if (idToken) {
        await Promise.resolve(onGoogleLogin(idToken));
      } else {
        setSigningIn(false);
      }
    } catch {
      setError("We couldn't sign you in. Try again.");
      setSigningIn(false);
    }
  };

  // Web Google Sign-In (GIS): render the official button (skipped on native).
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (isNative || !clientId) return;
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
          {isNative ? (
            <button
              className={styles.gbtnNative}
              data-testid="google-signin-btn"
              disabled={signingIn}
              onClick={doNativeGoogle}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              {signingIn ? "Signing in…" : "Continue with Google"}
            </button>
          ) : (
            <div ref={btnRef} data-testid="google-signin-btn" />
          )}
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
