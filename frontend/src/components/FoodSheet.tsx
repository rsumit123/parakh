import { useState } from "react";
import { OPT_KEYS, type Macros, type MacroKey, type Meal } from "../api/diet";
import { mealForTime } from "../diet/meals";
import { MealChips } from "./MealChips";
import { isLiquid } from "../diet/portion";
import styles from "./FoodSheet.module.css";

// Nutrient fields shown in the form, in the order the Today card lists them.
// Energy is entered in kcal and stored in kJ.
const FIELDS: { key: MacroKey; label: string; unit: string }[] = [
  { key: "energy_kj", label: "Energy", unit: "kcal" },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "carbs_g", label: "Carbs", unit: "g" },
  { key: "fat_g", label: "Fat", unit: "g" },
  { key: "fibre_g", label: "Fibre", unit: "g" },
  { key: "sugars_g", label: "Sugar", unit: "g" },
  { key: "sat_fat_g", label: "Sat fat", unit: "g" },
  { key: "salt_g", label: "Salt", unit: "g" },
];
const KJ_PER_KCAL = 4.184;

export interface FoodValues { name: string; grams: number; macros: Macros; meal?: Meal; }

// kcal reads best as a whole number; grams keep one decimal (salt, sat fat are small).
const round = (k: MacroKey, v: number) => (k === "energy_kj" ? Math.round(v) : Math.round(v * 10) / 10);

const toForm = (m?: Macros): Record<MacroKey, string> => {
  const out = {} as Record<MacroKey, string>;
  for (const f of FIELDS) {
    const raw = m ? m[f.key] : null;
    const v = raw == null ? 0 : f.key === "energy_kj" ? raw / KJ_PER_KCAL : raw;
    out[f.key] = v ? String(round(f.key, v)) : "";
  }
  return out;
};

/** Bottom sheet to enter a food by hand (mode "add") or correct a logged one
 * (mode "edit"). Nutrients are for the whole amount eaten, not per 100 g; changing
 * the amount rescales them so a portion fix is a single edit. */
export function FoodSheet({ mode, initial, title, photoUrl, onSave, onDelete, onCancel }: {
  mode: "add" | "edit";
  title?: string;
  photoUrl?: string;
  initial?: FoodValues;
  onSave: (v: FoodValues) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [grams, setGrams] = useState(String(Math.round(initial?.grams ?? 100)));
  const [vals, setVals] = useState(() => toForm(initial?.macros));
  const [meal, setMeal] = useState<Meal>(initial?.meal ?? mealForTime());
  const [zoom, setZoom] = useState(false);

  const changeGrams = (next: string) => {
    const oldG = Number(grams) || 0;
    const newG = Number(next) || 0;
    if (oldG > 0 && newG > 0) {
      const f = newG / oldG;
      const scaled = {} as Record<MacroKey, string>;
      for (const fl of FIELDS) {
        const v = Number(vals[fl.key]) || 0;
        scaled[fl.key] = v ? String(round(fl.key, v * f)) : "";
      }
      setVals(scaled);
    }
    setGrams(next);
  };

  const g = Number(grams) || 0;
  const valid = name.trim().length > 0 && g > 0;
  const unit = isLiquid(name) ? "ml" : "g";

  const save = () => {
    if (!valid) return;
    const macros = {} as Record<MacroKey, number | null>;
    for (const f of FIELDS) {
      // Blank carbs/fat = unknown (null), not 0; other blanks count as 0.
      if ((OPT_KEYS as MacroKey[]).includes(f.key) && vals[f.key].trim() === "") { macros[f.key] = null; continue; }
      const v = Math.max(0, Number(vals[f.key]) || 0);
      macros[f.key] = f.key === "energy_kj" ? v * KJ_PER_KCAL : v;
    }
    onSave({ name: name.trim(), grams: g, macros: macros as Macros, meal });
  };

  return (
    <div className={styles.wrap} role="dialog" aria-label={mode === "add" ? "Add food" : "Edit food"}>
      <div className={styles.scrim} onClick={onCancel} />
      <div className={styles.sheet}>
        <div className={styles.grab} />
        {photoUrl && (
          <button className={styles.photoBtn} onClick={() => setZoom(true)} aria-label="View photo full size">
            <img className={styles.photo} src={photoUrl} alt="Your meal" />
          </button>
        )}
        <h3 className={styles.h}>{title ?? (mode === "add" ? "Add food manually" : "Edit food")}</h3>
        <div className={styles.meal}><MealChips value={meal} onChange={setMeal} /></div>
        <label className={styles.field}>
          <span>Name</span>
          <input value={name} placeholder="e.g. Poha" aria-label="Food name"
            onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Amount</span>
          <input type="number" inputMode="decimal" min={0} value={grams} aria-label="Amount"
            onChange={(e) => changeGrams(e.target.value)} />
          <em>{unit}</em>
        </label>
        <div className={styles.sub}>Nutrients for this amount{mode === "add" ? " — leave blank if unknown" : ""}</div>
        <div className={styles.grid}>
          {FIELDS.map((f) => (
            <label key={f.key} className={styles.cell}>
              <span>{f.label}</span>
              <div>
                <input type="number" inputMode="decimal" min={0} value={vals[f.key]}
                  placeholder={(OPT_KEYS as MacroKey[]).includes(f.key) ? "?" : "0"}
                  aria-label={`${f.label} in ${f.unit}`}
                  onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
                <em>{f.unit}</em>
              </div>
            </label>
          ))}
        </div>
        <div className={styles.actions}>
          {onDelete && <button className={styles.del} onClick={onDelete}>Delete</button>}
          <button className={styles.save} onClick={save} disabled={!valid}>
            {mode === "add" ? "Add ✓" : "Save ✓"}
          </button>
        </div>
      </div>
      {zoom && photoUrl && (
        <button className={styles.viewer} onClick={() => setZoom(false)} aria-label="Close photo">
          <img src={photoUrl} alt="Your meal, full size" />
        </button>
      )}
    </div>
  );
}
