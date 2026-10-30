import { useEffect, useState } from "react";
import { deleteWeight, getWeight, logWeight, type WeightData } from "../api/diet";
import { dayTitle, shortDate } from "../diet/dates";
import { weightChange } from "../diet/weight";
import { LineChart } from "./LineChart";
import styles from "./WeightCard.module.css";

/** Weight on Today: the latest weigh-in, the week's change and a small trend line.
 * "Log" opens a sheet to save today's weight (which also keeps the targets current)
 * and to see or remove past weigh-ins. */
export function WeightCard({ token, today }: { token: string; today: string }) {
  const [data, setData] = useState<WeightData | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => { getWeight(token, 120, today).then(setData).catch(() => setData(null)); }, [token, today]);
  if (!data) return null;

  const pts = data.entries.slice(-12);
  const change = weightChange(data.entries);
  const toward = change && change.kg !== 0 && (data.goal === "lose" ? change.kg < 0 : data.goal === "gain" ? change.kg > 0 : null);
  const kgs = pts.map((p) => p.weight_kg);
  const range: [number, number] = [Math.min(...kgs) - 0.3, Math.max(...kgs) + 0.3];

  return (
    <section className={styles.card} aria-label="Weight">
      <div className={styles.head}>
        <b>Weight</b>
        <button className={styles.log} onClick={() => setOpen(true)}>{data.latest?.day === today ? "Edit" : "＋ Log"}</button>
      </div>
      {data.latest ? (
        <div className={styles.body}>
          <div className={styles.now}>
            <span className={styles.kg}>{data.latest.weight_kg.toFixed(1)}<small> kg</small></span>
            <span className={styles.when}>{dayTitle(data.latest.day, today)}</span>
            {change && (
              <span className={toward === true ? styles.good : styles.change}>
                {change.kg === 0 ? "No change" : `${change.kg < 0 ? "↓" : "↑"} ${Math.abs(change.kg).toFixed(1)} kg`} in {change.overDays} days
              </span>
            )}
          </div>
          {pts.length >= 2 && (
            <div className={styles.spark}>
              <LineChart values={kgs} target={0} active={active} onActive={setActive} range={range}
                height={56} top={6} ticks={[]} ariaLabel={`Weight trend: ${pts.map((p) => `${p.weight_kg} kg on ${shortDate(p.day)}`).join(", ")}`}
                tip={active != null && <span className={styles.tip}>{pts[active].weight_kg.toFixed(1)} kg · {shortDate(pts[active].day)}</span>} />
            </div>
          )}
        </div>
      ) : (
        <p className={styles.empty}>Weigh in once a week to see your trend. Your targets update with it.</p>
      )}
      {open && <WeightSheet token={token} today={today} data={data} onSaved={setData} onClose={() => setOpen(false)} />}
    </section>
  );
}

function WeightSheet({ token, today, data, onSaved, onClose }: {
  token: string; today: string; data: WeightData; onSaved: (d: WeightData) => void; onClose: () => void;
}) {
  const todays = data.entries.find((e) => e.day === today);
  const [kg, setKg] = useState((todays ?? data.latest)?.weight_kg.toFixed(1) ?? "");
  const [saving, setSaving] = useState(false);
  const n = Number(kg);
  const valid = n >= 25 && n <= 300;
  const step = (d: number) => setKg(((Number(kg) || data.latest?.weight_kg || 60) + d).toFixed(1));
  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try { onSaved(await logWeight(token, today, n)); onClose(); } catch { setSaving(false); }
  };
  const remove = async (day: string) => { try { onSaved(await deleteWeight(token, day)); } catch { /* ignore */ } };

  return (
    <div className={styles.wrap} role="dialog" aria-label="Log weight">
      <div className={styles.scrim} onClick={onClose} />
      <div className={styles.sheet}>
        <div className={styles.grab} />
        <h3 className={styles.h}>Today's weight</h3>
        <p className={styles.sub}>Best first thing in the morning. Your targets update with it.</p>
        <div className={styles.stepper}>
          <button onClick={() => step(-0.1)} aria-label="Less 0.1 kg">−</button>
          <label><input type="number" inputMode="decimal" step="0.1" value={kg} aria-label="Weight in kg"
            onChange={(e) => setKg(e.target.value)} /><span>kg</span></label>
          <button onClick={() => step(0.1)} aria-label="More 0.1 kg">＋</button>
        </div>
        <button className={styles.save} disabled={!valid || saving} onClick={save}>Save</button>
        {data.entries.length > 0 && (
          <>
            <div className={styles.histH}>Recent weigh-ins</div>
            <ul className={styles.hist}>
              {data.entries.slice(-6).reverse().map((e) => (
                <li key={e.day}>
                  <span>{dayTitle(e.day, today)}</span><b>{e.weight_kg.toFixed(1)} kg</b>
                  <button onClick={() => remove(e.day)} aria-label={`Remove weigh-in on ${shortDate(e.day)}`}>✕</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
