import type { Meal } from "../api/diet";
import { MEALS } from "../diet/meals";
import styles from "./MealChips.module.css";

/** Breakfast / Lunch / Snacks / Dinner picker. */
export function MealChips({ value, onChange }: { value: Meal; onChange: (m: Meal) => void }) {
  return (
    <div className={styles.row} role="radiogroup" aria-label="Meal">
      {MEALS.map((m) => (
        <button key={m.key} type="button" role="radio" aria-checked={value === m.key}
          className={value === m.key ? styles.on : styles.chip} onClick={() => onChange(m.key)}>
          {m.label}
        </button>
      ))}
    </div>
  );
}
