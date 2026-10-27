import { useEffect, useState } from "react";
import { getRecent, type RecentFood } from "../api/diet";
import { kcal, isLiquid, portionMacros } from "../diet/portion";
import styles from "./AddFoodSheet.module.css";

/** "Add food" chooser: snap or type a new food, or re-log one eaten before.
 * Recent = latest first; Frequent = foods logged at least twice, most-used first.
 * ＋ re-logs at the last amount in one tap; tapping the row opens it for tweaking. */
export function AddFoodSheet({ token, onSnap, onManual, onQuickAdd, onPick, onClose }: {
  token: string;
  onSnap: () => void; onManual: () => void;
  onQuickAdd: (f: RecentFood) => void; onPick: (f: RecentFood) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<RecentFood[] | null>(null);
  const [tab, setTab] = useState<"recent" | "frequent">("recent");
  useEffect(() => { getRecent(token).then((r) => setItems(r.items)).catch(() => setItems([])); }, [token]);

  const frequent = (items ?? []).filter((f) => f.uses >= 2).sort((a, b) => b.uses - a.uses);
  const list = tab === "recent" ? items ?? [] : frequent;

  return (
    <div className={styles.wrap} role="dialog" aria-label="Add food">
      <div className={styles.scrim} onClick={onClose} />
      <div className={styles.sheet}>
        <div className={styles.grab} />
        <div className={styles.options}>
          <button onClick={onSnap}><span>📷</span><b>Snap a meal</b><em>AI estimates the dishes</em></button>
          <button onClick={onManual}><span>✍️</span><b>Enter manually</b><em>Type the name and nutrients</em></button>
        </div>

        {items && items.length > 0 && (
          <>
            <div className={styles.tabs} role="tablist">
              <button role="tab" aria-selected={tab === "recent"} className={tab === "recent" ? styles.tabOn : undefined}
                onClick={() => setTab("recent")}>Recent</button>
              <button role="tab" aria-selected={tab === "frequent"} className={tab === "frequent" ? styles.tabOn : undefined}
                onClick={() => setTab("frequent")}>Frequent</button>
            </div>
            <div className={styles.list}>
              {list.length === 0 && <div className={styles.empty}>Foods you log more than once show up here.</div>}
              {list.map((f) => {
                const k = kcal(portionMacros(f.per100g, f.quantity_g).energy_kj);
                const unit = isLiquid(f.name) ? "ml" : "g";
                return (
                  <div key={`${f.barcode ?? ""}|${f.name}`} className={styles.row}>
                    <button className={styles.rowMain} onClick={() => onPick(f)} aria-label={`Adjust and add ${f.name}`}>
                      <span className={styles.name}>{f.name}</span>
                      <span className={styles.meta}>
                        {Math.round(f.quantity_g)}{unit} · {k} kcal{tab === "frequent" ? ` · ${f.uses}×` : ""}
                      </span>
                    </button>
                    <button className={styles.plus} onClick={() => onQuickAdd(f)} aria-label={`Add ${f.name} again`}>＋</button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
