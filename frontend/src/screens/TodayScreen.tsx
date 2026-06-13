import { useEffect, useState } from "react";
import { getDay, deleteLog, type DietDay, type MacroKey } from "../api/diet";
import { kcal } from "../diet/portion";
import styles from "./TodayScreen.module.css";

const ROWS: { key: MacroKey; label: string; unit: string; toDisplay?: (v: number) => number }[] = [
  { key: "energy_kj", label: "Energy", unit: "kcal", toDisplay: kcal },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "fibre_g", label: "Fibre", unit: "g" },
  { key: "sugars_g", label: "Sugar", unit: "g" },
  { key: "sat_fat_g", label: "Sat fat", unit: "g" },
  { key: "salt_g", label: "Salt", unit: "g" },
];

export function TodayScreen({ token, onAddFood, onOpenTargets }: {
  token: string; onAddFood: () => void; onOpenTargets: () => void;
}) {
  const [day, setDay] = useState<DietDay | null>(null);
  useEffect(() => { getDay(token).then(setDay).catch(() => setDay(null)); }, [token]);

  const remove = async (id: number) => {
    try { setDay(await deleteLog(token, id)); } catch { /* ignore */ }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <span className={styles.ttl}>Today</span>
        <button className={styles.gear} onClick={onOpenTargets} aria-label="Targets">⚙︎</button>
      </div>
      {!day && <div className={`skeleton ${styles.skel}`} />}
      {day && (
        <>
          <div className={styles.flag}>
            <div className={styles.k}>Today's gaps</div>
            <div className={styles.v}>{day.headline}</div>
          </div>
          <div className={styles.card}>
            {ROWS.map((r) => {
              const disp = r.toDisplay ?? ((v: number) => Math.round(v));
              const consumed = disp(day.totals[r.key]);
              const target = disp(day.targets[r.key]);
              const pct = Math.min(100, day.targets[r.key] ? (day.totals[r.key] / day.targets[r.key]) * 100 : 0);
              const st = day.status[r.key];
              const color = st === "over" ? "var(--red)" : st === "low" ? "var(--amber)" : "var(--green)";
              return (
                <div key={r.key} className={styles.mrow}>
                  <div className={styles.mtop}>
                    <span className={styles.mname}>{r.label}
                      {st !== "ok" && <span className={`${styles.tag} ${styles[st]}`}>{st}</span>}
                    </span>
                    <span className={styles.mval}><b>{consumed}</b> / {target} {r.unit}</span>
                  </div>
                  <div className={styles.bar}><div className={styles.fill} style={{ width: `${pct}%`, background: color }} /></div>
                </div>
              );
            })}
          </div>
          <div className={styles.sec}>Logged today · {day.entries.length}</div>
          {day.entries.map((e) => (
            <div key={e.id} className={styles.item}>
              <div className={styles.thumb}>{e.kind === "packaged" ? "🛒" : "🍽"}</div>
              <div>
                <div className={styles.iname}>{e.name}</div>
                <div className={styles.imeta}>{Math.round(e.quantity_g)}g</div>
              </div>
              <span className={styles.ical}>{kcal(e.energy_kj)}</span>
              <button className={styles.del} onClick={() => remove(e.id)} aria-label="Remove">🗑</button>
            </div>
          ))}
          {day.entries.length === 0 && <div className={styles.empty}>Nothing logged yet.</div>}
          <button className={styles.add} onClick={onAddFood}>＋ Add food</button>
        </>
      )}
    </div>
  );
}
