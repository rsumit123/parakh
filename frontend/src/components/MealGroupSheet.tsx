import type { LogEntry } from "../api/diet";
import { kcal, isLiquid } from "../diet/portion";
import { parseCount } from "../diet/foodSearch";
import styles from "./MealGroupSheet.module.css";
import { useBackHandler } from "../session/backHandlers";
import { PhotoPicker } from "./PhotoPicker";

/** A photo meal's dishes: shown as one row on Today, edited here dish by dish. */
export function MealGroupSheet({ name, entries, onEditDish, onRemoveDish, onDeleteMeal, onPhoto, onClose }: {
  name: string; entries: LogEntry[];
  onEditDish: (e: LogEntry) => void; onRemoveDish: (e: LogEntry) => void;
  onDeleteMeal: () => void; onClose: () => void;
  onPhoto?: (f: File) => Promise<unknown>;   // attach / replace the meal's photo
}) {
  useBackHandler(onClose);
  const photo = entries.find((e) => e.image_url)?.image_url;
  const total = entries.reduce((s, e) => s + e.energy_kj, 0);
  const protein = entries.reduce((s, e) => s + e.protein_g, 0);
  return (
    <div className={styles.wrap} role="dialog" aria-label={name}>
      <div className={styles.scrim} onClick={onClose} />
      <div className={styles.sheet}>
        <div className={styles.grab} />
        {photo && <img className={styles.photo} src={photo} alt="Your meal" />}
        {onPhoto && <PhotoPicker hasPhoto={!!photo} onPick={onPhoto} />}
        <h3 className={styles.h}>{name}</h3>
        <p className={styles.sub}>{kcal(total)} kcal · {Math.round(protein)} g protein · tap a dish to fix it</p>
        <ul className={styles.list}>
          {entries.map((e) => {
            const pc = parseCount(e.name);
            return (
              <li key={e.id}>
                <button className={styles.dish} onClick={() => onEditDish(e)} aria-label={`Edit ${e.name}`}>
                  <span className={styles.dname}>{pc ? pc.base : e.name}</span>
                  <span className={styles.amt}>{pc ? `${pc.count} pcs` : `${Math.round(e.quantity_g)} ${isLiquid(e.name) ? "ml" : "g"}`}</span>
                  <span className={styles.kc}>{kcal(e.energy_kj)}</span>
                </button>
                <button className={styles.rm} onClick={() => onRemoveDish(e)} aria-label={`Remove ${e.name}`}>✕</button>
              </li>
            );
          })}
        </ul>
        <button className={styles.delete} onClick={onDeleteMeal}>Delete meal</button>
      </div>
    </div>
  );
}
