import type { Product } from "../api/types";
import { gradeTone } from "../scan/grade";
import { buildComparison } from "../scan/compare";
import styles from "./CompareScreen.module.css";

interface Props {
  a: Product;
  b: Product;
  onBack: () => void;
}

interface Chip {
  text: string;
  tone: "bad" | "good";
}

function chipsFor(p: Product): Chip[] {
  const out: Chip[] = [];
  const nova = p.score.breakdown.nova;
  if (nova && nova.group >= 3) out.push({ text: `NOVA ${nova.group} · ${nova.label}`, tone: "bad" });
  for (const f of p.score.breakdown.india_flags) out.push({ text: f.label, tone: "bad" });
  if (out.length === 0) out.push({ text: "Clean", tone: "good" });
  return out;
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function ProductHead({ p }: { p: Product }) {
  return (
    <div className={styles.pcard}>
      {p.image_url ? (
        <img className={styles.thumb} src={p.image_url} alt={p.name || "product"} />
      ) : (
        <div className={styles.placeholder} aria-hidden="true">🛒</div>
      )}
      <div className={styles.pn}>{p.name || "Unknown product"}</div>
      <div className={styles.pb}>{p.brand}</div>
      <div className={styles.gline}>
        <span className={`${styles.g} ${styles[gradeTone(p.score.grade)]}`}>{p.score.grade}</span>
        <span className={styles.sc}>{p.score.overall}</span>
      </div>
    </div>
  );
}

export function CompareScreen({ a, b, onBack }: Props) {
  const rows = buildComparison(a, b);
  return (
    <div className={styles.screen}>
      <div className={styles.topbar}>
        <button className={styles.back} onClick={onBack} aria-label="Back">‹</button>
        <span className={styles.title}>Compare</span>
      </div>

      <div className={styles.header}>
        <ProductHead p={a} />
        <ProductHead p={b} />
      </div>

      <div className={styles.rows}>
        {rows.map((r) => (
          <div className={styles.nrow} key={r.key}>
            <div className={styles.nlab}>
              {r.label}{r.unit === "kcal" ? " (kcal/100g)" : ""}
            </div>
            <div className={styles.vals}>
              <div className={styles.cell} data-testid={`cell-${r.key}-a`} data-winner={r.winner === "a"}>
                {fmt(r.aValue)}{r.unit === "kcal" ? "" : r.unit}
                {r.winner === "a" && <span className={styles.tick}>✓</span>}
              </div>
              <div className={styles.cell} data-testid={`cell-${r.key}-b`} data-winner={r.winner === "b"}>
                {fmt(r.bValue)}{r.unit === "kcal" ? "" : r.unit}
                {r.winner === "b" && <span className={styles.tick}>✓</span>}
              </div>
            </div>
          </div>
        ))}

        <div className={styles.nrow}>
          <div className={styles.nlab}>Processing &amp; flags</div>
          <div className={styles.vals}>
            {[a, b].map((p, i) => (
              <div className={styles.chips} key={i}>
                {chipsFor(p).map((c, j) => (
                  <span key={j} className={`${styles.chip} ${c.tone === "bad" ? styles.bad : styles.ok}`}>{c.text}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
