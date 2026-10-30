import type { MealSuggestion } from "../api/diet";
import styles from "./MealSuggestions.module.css";

const names = (s: MealSuggestion) => s.items.map((i) => i.name).join(" · ");

/** Shown in an empty meal section: the usual meal for this slot with one-tap add,
 * plus a runner-up. "Usual" once it has been eaten on 2+ of the recent days. */
export function MealSuggestions({ slotLabel, suggestions, busy, onAdd }: {
  slotLabel: string; suggestions: MealSuggestion[]; busy: boolean; onAdd: (s: MealSuggestion) => void;
}) {
  const [top, alt] = suggestions;
  if (!top) return null;
  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <div className={styles.text}>
          <span className={styles.kicker}>{top.times >= 2 ? `Usual ${slotLabel.toLowerCase()} · ${top.times}×` : "Same as last time"}</span>
          <span className={styles.names}>{names(top)}</span>
          <span className={styles.meta}>{top.kcal} kcal · {Math.round(top.protein_g)} g protein</span>
        </div>
        <button className={styles.add} disabled={busy} onClick={() => onAdd(top)}
          aria-label={`Add usual ${slotLabel}: ${names(top)}`}>＋ Add</button>
      </div>
      {alt && (
        <button className={styles.alt} disabled={busy} onClick={() => onAdd(alt)}
          aria-label={`Add ${slotLabel}: ${names(alt)}`}>
          <span>or {names(alt)}</span><b>{alt.kcal} kcal ＋</b>
        </button>
      )}
    </div>
  );
}
