import { useState } from "react";
import type { Macros, Meal, RefFood } from "../api/diet";
import { kcal, portionMacros } from "../diet/portion";
import { mealForTime } from "../diet/meals";
import { portionName } from "../diet/foodSearch";
import { MealChips } from "./MealChips";
import styles from "./FoodPicker.module.css";

const SERVINGS = [0.5, 1, 1.5, 2];

/** How much of a reference food: pieces for countable foods (2 idli), servings or
 * grams for the rest. Nutrition comes from the food table, so it's one tap. */
export function FoodPicker({ food, meal: initialMeal, onAdd, onCancel }: {
  food: RefFood; meal?: Meal;
  onAdd: (v: { name: string; grams: number; per100g: Macros; meal: Meal }) => void;
  onCancel: () => void;
}) {
  const unit = food.unit_g;
  const [count, setCount] = useState(unit ? Math.max(1, Math.round(food.default_g / unit)) : 0);
  const [grams, setGrams] = useState(Math.round(food.default_g));
  const [meal, setMeal] = useState<Meal>(initialMeal ?? mealForTime());
  const g = unit ? count * unit : grams;
  const m = portionMacros(food.per100g, g);

  return (
    <div className={styles.wrap} role="dialog" aria-label={`Add ${food.name}`}>
      <div className={styles.scrim} onClick={onCancel} />
      <div className={styles.sheet}>
        <div className={styles.grab} />
        <h3 className={styles.h}>{food.name}</h3>
        <p className={styles.sub}>{unit ? `About ${unit} g each` : `A typical serving is ${Math.round(food.default_g)} g`}</p>
        <div className={styles.meal}><MealChips value={meal} onChange={setMeal} /></div>

        {unit ? (
          <div className={styles.stepper}>
            <button onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="One fewer" disabled={count <= 1}>−</button>
            <b aria-live="polite">{count}<span> {count === 1 ? "piece" : "pieces"}</span></b>
            <button onClick={() => setCount((c) => Math.min(20, c + 1))} aria-label="One more">＋</button>
          </div>
        ) : (
          <>
            <div className={styles.seg}>
              {SERVINGS.map((s) => {
                const sg = Math.round(food.default_g * s);
                return (
                  <button key={s} className={grams === sg ? styles.on : ""} onClick={() => setGrams(sg)}>
                    {s === 0.5 ? "½" : s === 1.5 ? "1½" : s}<small>{sg} g</small>
                  </button>
                );
              })}
            </div>
            <label className={styles.grams}>
              <input type="number" inputMode="numeric" min={0} value={grams || ""} aria-label="Amount in grams"
                onChange={(e) => setGrams(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
              <span>grams</span>
            </label>
          </>
        )}

        <div className={styles.preview}>
          <div><b>{kcal(m.energy_kj)}</b><span>kcal</span></div>
          <div><b>{Math.round(m.protein_g)}</b><span>protein g</span></div>
          <div><b>{Math.round(m.carbs_g ?? 0)}</b><span>carbs g</span></div>
          <div><b>{Math.round(m.fat_g ?? 0)}</b><span>fat g</span></div>
        </div>
        <button className={styles.add} disabled={g <= 0}
          onClick={() => onAdd({ name: portionName(food, unit ? count : null), grams: g, per100g: food.per100g, meal })}>
          Add {portionName(food, unit ? count : null)}
        </button>
      </div>
    </div>
  );
}
