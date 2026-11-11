import { useState } from "react";
import styles from "./PhotoPicker.module.css";

/** "Add photo" for something already logged (say, a meal logged from a Claude chat):
 * opens the phone's gallery/camera and hands the picked image to `onPick`. */
export function PhotoPicker({ hasPhoto, onPick }: { hasPhoto: boolean; onPick: (f: File) => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <label className={hasPhoto ? styles.change : styles.add} aria-busy={busy}>
      <input type="file" accept="image/*" className={styles.input} disabled={busy} aria-label={hasPhoto ? "Change photo" : "Add photo"}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true); setFailed(false);
          try { await onPick(f); } catch { setFailed(true); }
          setBusy(false);
        }} />
      {busy ? "Uploading…" : failed ? "Couldn't upload — try again" : hasPhoto ? "Change photo" : "📷 Add photo"}
    </label>
  );
}
