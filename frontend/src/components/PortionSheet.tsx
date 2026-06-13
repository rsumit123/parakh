import { useState } from "react";
import type { Macros } from "../api/diet";
import { portionMacros, kcal } from "../diet/portion";
import styles from "./PortionSheet.module.css";

export function PortionSheet({
  title, per100g, defaultGrams, onCancel, onConfirm,
}: {
  title: string; per100g: Macros; defaultGrams: number;
  onCancel: () => void; onConfirm: (grams: number) => void;
}) {
  const [grams, setGrams] = useState(Math.round(defaultGrams));
  const m = portionMacros(per100g, grams);
  const mult = (factor: number) => setGrams(Math.round(defaultGrams * factor));
  const activeFactor = grams === Math.round(defaultGrams * 0.5) ? 0.5
    : grams === Math.round(defaultGrams * 2) ? 2
    : grams === Math.round(defaultGrams * 1) ? 1 : 0;
  return (
    <div className={styles.wrap} role="dialog" aria-label="Portion">
      <div className={styles.scrim} onClick={onCancel} />
      <div className={styles.sheet}>
        <div className={styles.grab} />
        <h3 className={styles.h}>How much did you have?</h3>
        <p className={styles.sub}>{title}</p>
        <div className={styles.seg}>
          <button className={activeFactor === 0.5 ? styles.on : ""} onClick={() => mult(0.5)}>½</button>
          <button className={activeFactor === 1 ? styles.on : ""} onClick={() => mult(1)}>1 serving</button>
          <button className={activeFactor === 2 ? styles.on : ""} onClick={() => mult(2)}>2</button>
        </div>
        <div className={styles.grams}>
          <input type="number" min={0} value={grams} aria-label="Portion in grams"
            onChange={(e) => setGrams(Math.max(0, Number(e.target.value) || 0))} />
          <span>grams</span>
        </div>
        <div className={styles.preview}>
          <span>This counts</span>
          <b>{kcal(m.energy_kj)} kcal · {m.sugars_g.toFixed(1)}g sugar · {m.protein_g.toFixed(1)}g protein</b>
        </div>
        <button className={styles.add} onClick={() => onConfirm(grams)}>Add to today ✓</button>
      </div>
    </div>
  );
}
