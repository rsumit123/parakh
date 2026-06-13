import { useState } from "react";
import type { MealEstimate, Macros, LogBody } from "../api/diet";
import { portionMacros, kcal, isLiquid } from "../diet/portion";
import styles from "./ConfirmMealScreen.module.css";

const BLANK: Macros = { energy_kj: 0, sugars_g: 0, sat_fat_g: 0, salt_g: 0, fibre_g: 0, protein_g: 0 };

export function ConfirmMealScreen({ estimate, imageUrl, onConfirm, onBack }: {
  estimate: MealEstimate | null; imageUrl?: string;
  onConfirm: (body: LogBody) => void; onBack: () => void;
}) {
  const [name, setName] = useState(estimate?.name ?? "");
  const liquid = isLiquid(name);
  const [grams, setGrams] = useState(Math.round(estimate?.portion_g ?? 100));
  const [seg, setSeg] = useState<"s" | "m" | "l" | null>("m");
  const per100 = estimate?.per100g ?? BLANK;
  const m = portionMacros(per100, grams);
  const base = estimate?.portion_g || 100;
  const submit = () => onConfirm({
    kind: estimate ? "unpackaged" : "manual",
    name: name.trim() || "Meal", quantity_g: grams, per100g: per100, image_url: imageUrl,
  });
  return (
    <div className={styles.screen}>
      <div className={styles.top}><button className={styles.back} onClick={onBack} aria-label="Back">←</button><span>Confirm meal</span><span /></div>
      <div className={styles.card}>
        {imageUrl ? <img className={styles.photo} src={imageUrl} alt="" /> : <div className={styles.photo}>🍽</div>}
        <div className={styles.body}>
          <input className={styles.name} value={name} placeholder="Dish name"
            onChange={(e) => setName(e.target.value)} />
          <div className={styles.hint}>✏︎ Check the name &amp; portion</div>
        </div>
      </div>
      <div className={styles.label}>Portion</div>
      <div className={styles.seg}>
        <button className={seg === "s" ? styles.on : undefined} onClick={() => { setGrams(Math.round(base * 0.5)); setSeg("s"); }}>Small</button>
        <button className={seg === "m" ? styles.on : undefined} onClick={() => { setGrams(Math.round(base)); setSeg("m"); }}>{liquid ? "1 glass" : "1 plate"}</button>
        <button className={seg === "l" ? styles.on : undefined} onClick={() => { setGrams(Math.round(base * 1.5)); setSeg("l"); }}>Large</button>
      </div>
      <div className={styles.grams}>
        <input type="number" min={0} value={grams} aria-label={`Portion in ${liquid ? "millilitres" : "grams"}`}
          onChange={(e) => { setGrams(Math.max(0, Number(e.target.value) || 0)); setSeg(null); }} />
        <span>{liquid ? "ml" : "grams"}</span>
      </div>
      <div className={styles.preview}><span>Counts</span>
        <b>{kcal(m.energy_kj)} kcal · {m.sugars_g.toFixed(1)}g sugar · {m.protein_g.toFixed(1)}g protein</b></div>
      <button className={styles.add} onClick={submit}>Add to today ✓</button>
    </div>
  );
}
