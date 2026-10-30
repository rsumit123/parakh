import type { GapIdea, Gaps } from "../api/diet";
import styles from "./GapIdeas.module.css";

const LABEL = { protein_g: "protein", fibre_g: "fibre" } as const;

/** "Close today's gap": up to three foods that make up the protein / fibre still
 * missing, within the calories left; ones you already eat are marked. */
export function GapIdeas({ data, onAdd }: { data: Gaps; onAdd: (i: GapIdea) => void }) {
  const short = (Object.keys(LABEL) as (keyof typeof LABEL)[]).filter((k) => data.gaps[k]);
  if (!data.ideas.length || !short.length) return null;
  return (
    <section className={styles.card} aria-label="Close today's gap">
      <div className={styles.head}>
        <b>Close today's gap</b>
        <span>{short.map((k) => `${data.gaps[k]} g ${LABEL[k]}`).join(" · ")} to go</span>
      </div>
      {data.ideas.map((i) => {
        const adds = [i.protein_g >= 1 && `+${Math.round(i.protein_g)} g protein`, i.fibre_g >= 1 && `+${Math.round(i.fibre_g)} g fibre`]
          .filter(Boolean).join(" · ");
        return (
          <div key={i.name} className={styles.row}>
            <div className={styles.main}>
              <span className={styles.name}>{i.name}{i.own && <em className={styles.own}>you eat this</em>}</span>
              <span className={styles.meta}>{adds} · {i.kcal} kcal</span>
            </div>
            <button className={styles.add} onClick={() => onAdd(i)} aria-label={`Add ${i.name}`}>＋ Add</button>
          </div>
        );
      })}
    </section>
  );
}
