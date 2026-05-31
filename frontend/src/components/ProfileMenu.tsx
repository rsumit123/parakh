import { useEffect, useRef, useState } from "react";
import styles from "./ProfileMenu.module.css";

interface Props {
  label: string;          // e.g. "Guest" or an email
  isGuest: boolean;
  onHistory: () => void;
  onSignOut: () => void;
  variant?: "light" | "dark"; // dark = on light backgrounds
}

export function ProfileMenu({ label, isGuest, onHistory, onSignOut, variant = "light" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = (isGuest ? "G" : label.trim()[0] || "U").toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        className={`${styles.avatar} ${variant === "dark" ? styles.dark : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Profile menu"
      >
        {initial}
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.who}>
            <div className={styles.whoLabel}>{isGuest ? "Guest" : label}</div>
            <div className={styles.whoSub}>{isGuest ? "Not signed in" : "Signed in"}</div>
          </div>
          <button className={styles.item} role="menuitem" onClick={() => { setOpen(false); onHistory(); }}>
            <span className={styles.itemIcon}>🕘</span> Scan history
          </button>
          <button className={`${styles.item} ${styles.danger}`} role="menuitem" onClick={() => { setOpen(false); onSignOut(); }}>
            <span className={styles.itemIcon}>↩</span> {isGuest ? "Reset session" : "Log out"}
          </button>
        </div>
      )}
    </div>
  );
}
