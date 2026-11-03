import { useState } from "react";
import type { MealSuggestion } from "../api/diet";
import styles from "./MealSuggestions.module.css";

const names = (s: MealSuggestion) => s.items.map((i) => i.name).join(" · ");

/** The usual meal for the slot that's coming up, as one compact line with one-tap add.
 * Other options stay folded behind "More" so an empty day doesn't fill with cards. */
export function MealSuggestions({ slotLabel, suggestions, busy, onAdd }: {
  slotLabel: string; suggestions: MealSuggestion[]; busy: boolean; onAdd: (s: MealSuggestion) => void;
}) {
  const [more, setMore] = useState(false);
  const [top, ...rest] = suggestions;
  if (!top) return null;
  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <div className={styles.text}>
          <span className={styles.kicker}>↻ {top.times >= 2 ? `Usual ${slotLabel.toLowerCase()}` : "Same as last time"}</span>
          <span className={styles.names}>{names(top)}</span>
          <span className={styles.meta}>{top.kcal} kcal · {Math.round(top.protein_g)} g protein</span>
        </div>
        <button className={styles.add} disabled={busy} onClick={() => onAdd(top)}
          aria-label={`Add usual ${slotLabel}: ${names(top)}`}>＋ Add</button>
      </div>
      {rest.length > 0 && !more && (
        <button className={styles.more} onClick={() => setMore(true)}>More options</button>
      )}
      {more && rest.map((alt) => (
        <button key={alt.entry_ids.join(",")} className={styles.alt} disabled={busy} onClick={() => onAdd(alt)}
          aria-label={`Add ${slotLabel}: ${names(alt)}`}>
          <span>{names(alt)}</span><b>{alt.kcal} kcal ＋</b>
        </button>
      ))}
    </div>
  );
}
