import { useEffect, type ReactNode } from "react";
import styles from "./Modal.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  icon?: string;
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
}

/** Lightweight centered modal with a scrim. Closes on scrim click / Escape. */
export function Modal({ open, onClose, icon, title, body, primaryLabel, onPrimary, secondaryLabel }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.card} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {icon && <div className={styles.icon}>{icon}</div>}
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.body}>{body}</p>
        <button className={styles.primary} onClick={onPrimary}>{primaryLabel}</button>
        {secondaryLabel && (
          <button className={styles.secondary} onClick={onClose}>{secondaryLabel}</button>
        )}
      </div>
    </div>
  );
}

export type ModalNode = ReactNode;
