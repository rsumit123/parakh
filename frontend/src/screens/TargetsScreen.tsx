import { useEffect, useState } from "react";
import {
  getProfile, putProfile, type Totals, type MacroKey, type Activity, type Goal, type Sex,
} from "../api/diet";
import { kcal } from "../diet/portion";
import { computeTargets, basisOf, sameTarget, ASSUMED, type AboutYou } from "../diet/targets";
import styles from "./TargetsScreen.module.css";

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
const ACTIVITIES: { key: Activity; label: string; sub: string }[] = [
  { key: "sedentary", label: "Mostly sitting", sub: "Desk job, little exercise" },
  { key: "light", label: "Lightly active", sub: "Walks, exercise 1–3 days/week" },
  { key: "moderate", label: "Moderately active", sub: "Exercise 3–5 days/week" },
  { key: "active", label: "Very active", sub: "Hard exercise or physical work" },
];
const GOALS: { key: Goal; label: string }[] = [
  { key: "lose", label: "Lose weight" }, { key: "maintain", label: "Maintain" }, { key: "gain", label: "Gain weight" },
];
const EMPTY: AboutYou = { sex: null, age: null, weight_kg: null, height_cm: null, activity: null, goal: null };

// Displayed in kcal / g; stored in kJ / g.
const toShown = (k: MacroKey, v: number) => (k === "energy_kj" ? kcal(v) : Math.round(v));
const fromShown = (k: MacroKey, v: number) => (k === "energy_kj" ? v * 4.184 : v);
const num = (s: string) => (s.trim() === "" ? null : Number(s));

/** "About you" (drives calculated targets) + per-nutrient custom values on top.
 * Only values that differ from the calculated ones are saved as overrides, so
 * targets keep following the profile unless you pin one. */
// Where each target comes from, shown behind a tap so the screen stays clean.
const HOW: [string, string][] = [
  ["Energy", "Indian BMR × activity level (ICMR-NIN 2020)"],
  ["Protein", "0.83 g per kg (ICMR-NIN); 1.1 g when losing or gaining"],
  ["Fibre", "40 g per 2000 kcal (ICMR-NIN)"],
  ["Carbs · Fat", "About 50% and 30% of energy, for reference"],
  ["Limits", "Sugar and sat fat under 10% of energy; salt 5\u00a0g"],
];

export function TargetsScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const [about, setAbout] = useState<AboutYou | null>(null);
  const [custom, setCustom] = useState<Partial<Totals>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProfile(token).then((r) => {
      const { target_overrides, ...rest } = r.profile;
      const a = { ...EMPTY, ...rest };
      const calc = computeTargets(a);
      // Older app versions saved every target as an override; drop the ones that
      // just repeat the calculated value so they don't pin anything.
      const keep: Partial<Totals> = {};
      for (const f of FIELDS) {
        const v = target_overrides?.[f.key];
        if (typeof v === "number" && v > 0 && !sameTarget(f.key, v, calc[f.key])) keep[f.key] = v;
      }
      setAbout(a);
      setCustom(keep);
    }).catch(() => { setAbout(EMPTY); });
  }, [token]);

  if (!about) return <div className={styles.screen}><div className={`skeleton ${styles.skel}`} /></div>;

  const calc = computeTargets(about);
  const basis = basisOf(about);
  const missing = [!about.age && "age", !about.height_cm && "height", !about.weight_kg && "weight",
    !about.sex && "sex", !about.activity && "activity", !about.goal && "goal"].filter(Boolean) as string[];
  const set = (patch: Partial<AboutYou>) => setAbout({ ...about, ...patch });

  const save = async () => {
    setSaving(true);
    const overrides: Partial<Totals> = {};
    for (const f of FIELDS) {
      const v = custom[f.key];
      if (v !== undefined && v > 0 && !sameTarget(f.key, v, calc[f.key])) overrides[f.key] = v;
    }
    try { await putProfile(token, { ...about, target_overrides: overrides }); onBack(); }
    catch { setSaving(false); }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <button className={styles.back} onClick={onBack} aria-label="Back">←</button>
        <span>Your targets</span><span />
      </div>

      <h2 className={styles.h}>About you</h2>
      <p className={styles.note}>
        {basis === "calculated" ? "Targets below are calculated for you."
          : basis === "estimated" ? `Estimated so far. Add your ${missing.join(", ")} for exact numbers (assuming ${
              !about.age ? `age ${ASSUMED.age}` : "typical values"} meanwhile).`
          : "Fill these in to get targets for your body and goal."}
      </p>
      <div className={styles.seg} role="radiogroup" aria-label="Sex">
        {(["male", "female"] as Sex[]).map((s) => (
          <button key={s} role="radio" aria-checked={about.sex === s} className={about.sex === s ? styles.on : undefined}
            onClick={() => set({ sex: s })}>{s === "male" ? "Male" : "Female"}</button>
        ))}
      </div>
      <div className={styles.body}>
        <label><span>Age</span><input type="number" inputMode="numeric" value={about.age ?? ""} placeholder="add"
          aria-label="Age in years" onChange={(e) => set({ age: num(e.target.value) })} /><em>yrs</em></label>
        <label><span>Height</span><input type="number" inputMode="decimal" value={about.height_cm ?? ""} placeholder="add"
          aria-label="Height in cm" onChange={(e) => set({ height_cm: num(e.target.value) })} /><em>cm</em></label>
        <label><span>Weight</span><input type="number" inputMode="decimal" value={about.weight_kg ?? ""} placeholder="add"
          aria-label="Weight in kg" onChange={(e) => set({ weight_kg: num(e.target.value) })} /><em>kg</em></label>
      </div>
      <div className={styles.label}>How active are you?</div>
      <div className={styles.choices} role="radiogroup" aria-label="Activity">
        {ACTIVITIES.map((a) => (
          <button key={a.key} role="radio" aria-checked={about.activity === a.key}
            className={about.activity === a.key ? styles.choiceOn : styles.choice} onClick={() => set({ activity: a.key })}>
            <b>{a.label}</b><em>{a.sub}</em>
          </button>
        ))}
      </div>
      <div className={styles.label}>Goal</div>
      <div className={styles.seg} role="radiogroup" aria-label="Goal">
        {GOALS.map((g) => (
          <button key={g.key} role="radio" aria-checked={about.goal === g.key} className={about.goal === g.key ? styles.on : undefined}
            onClick={() => set({ goal: g.key })}>{g.label}</button>
        ))}
      </div>

      <h2 className={styles.h}>Daily targets</h2>
      <p className={styles.note}>Change any value to set your own; ✕ goes back to the calculated one.</p>
      {FIELDS.map((f) => {
        const pinned = custom[f.key] !== undefined;
        const value = pinned ? custom[f.key]! : calc[f.key];
        return (
          <div key={f.key} className={styles.row}>
            <span className={styles.lbl}>{f.label}
              <small className={pinned ? styles.mine : styles.auto}>{pinned ? "custom" : basis}</small>
            </span>
            <input type="number" min={0} value={toShown(f.key, value)} aria-label={`${f.label} target`}
              onChange={(e) => setCustom({ ...custom, [f.key]: fromShown(f.key, Math.max(0, Number(e.target.value) || 0)) })} />
            <span className={styles.unit}>{f.unit}</span>
            {pinned
              ? <button className={styles.reset} onClick={() => { const c = { ...custom }; delete c[f.key]; setCustom(c); }}
                  aria-label={`Reset ${f.label} to calculated`}>✕</button>
              : <span className={styles.reset} />}
          </div>
        );
      })}
      <details className={styles.how}>
        <summary>Based on ICMR-NIN (India) guidance <span>How these are set</span></summary>
        <dl>
          {HOW.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <p>General guidance, not medical advice.</p>
      </details>
      <button className={styles.save} onClick={save} disabled={saving}>Save</button>
    </div>
  );
}
