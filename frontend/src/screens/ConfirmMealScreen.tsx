import { useState } from "react";
import type { MealEstimate, Macros, MacroKey, LogBody } from "../api/diet";
import { portionMacros, kcal, isLiquid } from "../diet/portion";
import styles from "./ConfirmMealScreen.module.css";

const MK: MacroKey[] = ["energy_kj", "sugars_g", "sat_fat_g", "salt_g", "fibre_g", "protein_g"];

interface Row { name: string; grams: number; per100g: Macros; base: number; }

export function ConfirmMealScreen({ estimate, onConfirm, onBack }: {
  estimate: MealEstimate; onConfirm: (body: LogBody) => void; onBack: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => estimate.items.map((i) => ({
    name: i.name, grams: Math.round(i.portion_g), per100g: i.per100g, base: i.portion_g || 100,
  })));
  const multi = rows.length > 1;
  const [mealName, setMealName] = useState(multi ? "Thali" : (rows[0]?.name ?? "Meal"));

  const setRow = (idx: number, patch: Partial<Row>) =>
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeRow = (idx: number) => setRows(rows.filter((_, i) => i !== idx));

  const total = rows.reduce((acc, r) => {
    const m = portionMacros(r.per100g, r.grams);
    MK.forEach((k) => { acc[k] = (acc[k] || 0) + m[k]; });
    return acc;
  }, {} as Macros);
  const totalGrams = rows.reduce((s, r) => s + r.grams, 0);

  const submit = () => {
    const per100g = {} as Macros;
    MK.forEach((k) => { per100g[k] = totalGrams > 0 ? (total[k] * 100) / totalGrams : 0; });
    const name = multi ? (mealName.trim() || "Meal") : (rows[0]?.name.trim() || "Meal");
    onConfirm({ kind: "unpackaged", name, quantity_g: totalGrams, per100g });
  };

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <button className={styles.back} onClick={onBack} aria-label="Back">←</button>
        <span>Confirm meal</span><span />
      </div>

      <div className={styles.card}>
        <div className={styles.photo}>🍽</div>
        <div className={styles.body}>
          {multi ? (
            <input className={styles.name} value={mealName} placeholder="Meal name"
              aria-label="Meal name" onChange={(e) => setMealName(e.target.value)} />
          ) : (
            <input className={styles.name} value={rows[0]?.name ?? ""} placeholder="Dish name"
              aria-label="Dish name" onChange={(e) => setRow(0, { name: e.target.value })} />
          )}
          <div className={styles.hint}>✏︎ Check the {multi ? "dishes & portions" : "name & portion"}</div>
        </div>
      </div>

      {!multi && rows[0] && (() => {
        const r = rows[0];
        const liquid = isLiquid(r.name);
        const m = portionMacros(r.per100g, r.grams);
        const active = r.grams === Math.round(r.base * 0.5) ? 0.5
          : r.grams === Math.round(r.base * 2) ? 2
          : r.grams === Math.round(r.base) ? 1 : 0;
        return (
          <>
            <div className={styles.label}>Portion</div>
            <div className={styles.seg}>
              <button className={active === 0.5 ? styles.on : undefined} onClick={() => setRow(0, { grams: Math.round(r.base * 0.5) })}>Small</button>
              <button className={active === 1 ? styles.on : undefined} onClick={() => setRow(0, { grams: Math.round(r.base) })}>{liquid ? "1 glass" : "1 plate"}</button>
              <button className={active === 2 ? styles.on : undefined} onClick={() => setRow(0, { grams: Math.round(r.base * 2) })}>Large</button>
            </div>
            <div className={styles.grams}>
              <input type="number" min={0} value={r.grams} aria-label={`Portion in ${liquid ? "millilitres" : "grams"}`}
                onChange={(e) => setRow(0, { grams: Math.max(0, Number(e.target.value) || 0) })} />
              <span>{liquid ? "ml" : "grams"}</span>
            </div>
            <div className={styles.preview}><span>Counts</span>
              <b>{kcal(m.energy_kj)} kcal · {m.sugars_g.toFixed(1)}g sugar · {m.protein_g.toFixed(1)}g protein</b></div>
          </>
        );
      })()}

      {multi && (
        <>
          <div className={styles.label}>Dishes</div>
          {rows.map((r, idx) => {
            const liquid = isLiquid(r.name);
            return (
              <div key={idx} className={styles.row}>
                <input className={styles.rowName} value={r.name} aria-label="Dish name"
                  onChange={(e) => setRow(idx, { name: e.target.value })} />
                <input className={styles.rowGrams} type="number" min={0} value={r.grams}
                  aria-label={`Portion in ${liquid ? "millilitres" : "grams"}`}
                  onChange={(e) => setRow(idx, { grams: Math.max(0, Number(e.target.value) || 0) })} />
                <span className={styles.unit}>{liquid ? "ml" : "g"}</span>
                <button className={styles.rm} onClick={() => removeRow(idx)} aria-label="Remove dish" disabled={rows.length <= 1}>✕</button>
              </div>
            );
          })}
          <div className={styles.preview}><span>Total</span>
            <b>{kcal(total.energy_kj)} kcal · {total.protein_g.toFixed(0)}g protein · {total.sugars_g.toFixed(0)}g sugar</b></div>
        </>
      )}

      <button className={styles.add} onClick={submit} disabled={rows.length === 0}>Add to today ✓</button>
    </div>
  );
}
