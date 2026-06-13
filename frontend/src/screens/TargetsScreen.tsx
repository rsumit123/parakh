import { useEffect, useState } from "react";
import { getProfile, putProfile, type Macros, type MacroKey } from "../api/diet";
import { kcal } from "../diet/portion";
import styles from "./TargetsScreen.module.css";

const FIELDS: { key: MacroKey; label: string; unit: string }[] = [
  { key: "energy_kj", label: "Energy", unit: "kcal" },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "fibre_g", label: "Fibre", unit: "g" },
  { key: "sugars_g", label: "Sugar", unit: "g" },
  { key: "sat_fat_g", label: "Sat fat", unit: "g" },
  { key: "salt_g", label: "Salt", unit: "g" },
];

export function TargetsScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const [vals, setVals] = useState<Record<MacroKey, number> | null>(null);
  useEffect(() => {
    getProfile(token).then((r) => {
      const t = r.effective_targets;
      setVals({ ...t, energy_kj: kcal(t.energy_kj) });   // show energy as kcal
    }).catch(() => setVals(null));
  }, [token]);

  const save = async () => {
    if (!vals) return;
    const overrides: Partial<Macros> = {};
    for (const f of FIELDS) {
      overrides[f.key] = f.key === "energy_kj" ? vals.energy_kj * 4.184 : vals[f.key];
    }
    try { await putProfile(token, { target_overrides: overrides }); onBack(); } catch { /* ignore */ }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.top}><button className={styles.back} onClick={onBack} aria-label="Back">←</button><span>Daily targets</span><span /></div>
      <p className={styles.note}>Smart defaults are set for you. Adjust any to personalise.</p>
      {vals && FIELDS.map((f) => (
        <div key={f.key} className={styles.row}>
          <span className={styles.lbl}>{f.label}</span>
          <input type="number" min={0} value={Math.round(vals[f.key])} aria-label={f.label}
            onChange={(e) => setVals({ ...vals, [f.key]: Math.max(0, Number(e.target.value) || 0) })} />
          <span className={styles.unit}>{f.unit}</span>
        </div>
      ))}
      <button className={styles.save} onClick={save}>Save targets</button>
    </div>
  );
}
