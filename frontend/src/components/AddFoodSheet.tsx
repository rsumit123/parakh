import { useEffect, useState } from "react";
import { getFoods, getRecent, type RecentFood, type RefFood } from "../api/diet";
import { kcal, isLiquid, portionMacros } from "../diet/portion";
import { parseCount, searchFoods } from "../diet/foodSearch";
import styles from "./AddFoodSheet.module.css";

/** "Add food" chooser: search common foods, snap or type a new one, or re-log one
 * eaten before. Recent = latest first; Frequent = foods logged at least twice.
 * ＋ re-logs at the last amount in one tap; tapping the row opens it for tweaking.
 * Typing searches your own foods first, then the reference table of Indian foods. */
export function AddFoodSheet({ token, onSnap, onManual, onQuickAdd, onPick, onFood, onClose }: {
  token: string;
  onSnap: () => void; onManual: () => void;
  onQuickAdd: (f: RecentFood) => void; onPick: (f: RecentFood) => void;
  onFood: (f: RefFood) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<RecentFood[] | null>(null);
  const [tab, setTab] = useState<"recent" | "frequent">("recent");
  const [q, setQ] = useState("");
  const [foods, setFoods] = useState<RefFood[]>([]);
  useEffect(() => { getRecent(token).then((r) => setItems(r.items)).catch(() => setItems([])); }, [token]);
  useEffect(() => { getFoods(token).then(setFoods).catch(() => setFoods([])); }, [token]);

  const frequent = (items ?? []).filter((f) => f.uses >= 2).sort((a, b) => b.uses - a.uses);
  const searching = q.trim().length > 0;
  const mine = searching ? (items ?? []).filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 4) : [];
  const found = searching ? searchFoods(foods, q) : [];
  const list = tab === "recent" ? items ?? [] : frequent;

  const recentRow = (f: RecentFood, showUses: boolean) => {
    const k = kcal(portionMacros(f.per100g, f.quantity_g).energy_kj);
    const unit = isLiquid(f.name) ? "ml" : "g";
    return (
      <div key={`${f.barcode ?? ""}|${f.name}`} className={styles.row}>
        <button className={styles.rowMain} onClick={() => onPick(f)} aria-label={`Adjust and add ${f.name}`}>
          <span className={styles.name}>{f.name}</span>
          <span className={styles.meta}>
            {parseCount(f.name) ? `${parseCount(f.name)!.count} pcs` : `${Math.round(f.quantity_g)}${unit}`} · {k} kcal{showUses ? ` · ${f.uses}×` : ""}
          </span>
        </button>
        <button className={styles.plus} onClick={() => onQuickAdd(f)} aria-label={`Add ${f.name} again`}>＋</button>
      </div>
    );
  };

  return (
    <div className={styles.wrap} role="dialog" aria-label="Add food">
      <div className={styles.scrim} onClick={onClose} />
      <div className={styles.sheet}>
        <div className={styles.grab} />
        <label className={styles.search}>
          <span aria-hidden>🔍</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search"
            placeholder="Search foods — idli, dal, roti…" aria-label="Search foods" />
          {searching && <button onClick={() => setQ("")} aria-label="Clear search">✕</button>}
        </label>
        {!searching && <div className={styles.options}>
          <button onClick={onSnap}><span>📷</span><b>Snap a meal</b><em>AI estimates the dishes</em></button>
          <button onClick={onManual}><span>✍️</span><b>Enter manually</b><em>Type the name and nutrients</em></button>
        </div>}

        {searching && (
          <div className={styles.list}>
            {mine.length > 0 && <div className={styles.group}>Your foods</div>}
            {mine.map((f) => recentRow(f, false))}
            {found.length > 0 && <div className={styles.group}>Common foods</div>}
            {found.map((f) => (
              <button key={f.id} className={styles.food} onClick={() => onFood(f)} aria-label={`Add ${f.name}`}>
                <span className={styles.name}>{f.name}</span>
                <span className={styles.meta}>
                  {f.unit_g ? `1 piece · ${kcal(portionMacros(f.per100g, f.unit_g).energy_kj)} kcal`
                    : `${Math.round(f.default_g)} g · ${kcal(portionMacros(f.per100g, f.default_g).energy_kj)} kcal`}
                </span>
                <span className={styles.go}>›</span>
              </button>
            ))}
            {mine.length === 0 && found.length === 0 && (
              <div className={styles.empty}>
                No match for “{q.trim()}”. <button className={styles.link} onClick={onManual}>Enter it manually</button>
                {" "}or snap a photo.
              </div>
            )}
          </div>
        )}

        {!searching && items && items.length > 0 && (
          <>
            <div className={styles.tabs} role="tablist">
              <button role="tab" aria-selected={tab === "recent"} className={tab === "recent" ? styles.tabOn : undefined}
                onClick={() => setTab("recent")}>Recent</button>
              <button role="tab" aria-selected={tab === "frequent"} className={tab === "frequent" ? styles.tabOn : undefined}
                onClick={() => setTab("frequent")}>Frequent</button>
            </div>
            <div className={styles.list}>
              {list.length === 0 && <div className={styles.empty}>Foods you log more than once show up here.</div>}
              {list.map((f) => recentRow(f, tab === "frequent"))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
