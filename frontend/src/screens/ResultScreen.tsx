import { useState } from "react";
import type { Product } from "../api/types";
import { gradeTone } from "../scan/grade";
import { ScoreRing } from "../components/ScoreRing";
import { Breakdown } from "./Breakdown";
import { explanationForReason, explanationForNova } from "../scan/explanations";
import styles from "./ResultScreen.module.css";

function ReasonChip({ reason, kind }: { reason: string; kind: "pos" | "neg" }) {
  const [open, setOpen] = useState(false);
  const exp = kind === "neg" ? explanationForReason(reason) : null;
  const expandable = exp !== null;

  return (
    <div className={`${styles.reasonWrap} ${styles[kind]}`}>
      <button
        className={styles.reason}
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={expandable ? open : undefined}
        style={{ cursor: expandable ? "pointer" : "default" }}
      >
        <span className={styles.ic}>{kind === "pos" ? "✓" : "!"}</span>
        <span className={styles.reasonText}>{reason}</span>
        {expandable && <span className={styles.why}>{open ? "Hide" : "Why?"}</span>}
      </button>
      {open && exp && (
        <div className={styles.explain}>
          <p>{exp.body}</p>
          <p className={styles.source}>Source: {exp.source}</p>
        </div>
      )}
    </div>
  );
}

export function ResultScreen({ product, onScanAgain }: { product: Product; onScanAgain: () => void }) {
  const [open, setOpen] = useState(false);
  const { score } = product;
  const tone = gradeTone(score.grade);
  const nova = score.breakdown.nova;
  const novaExp = nova ? explanationForNova(nova.group) : null;
  const [novaOpen, setNovaOpen] = useState(false);

  return (
    <div className={styles.screen}>
      <div className={`${styles.hero} ${styles[tone]}`}>
        <div className={styles.scoreLabel}>NUTRI-SCORE</div>
        <ScoreRing grade={score.grade} overall={score.overall} />
        <div className={styles.verdict}>{score.verdict}</div>
        <div className={styles.sub}>{product.source === "db" ? "From your scans" : "Freshly scored"}</div>
      </div>

      <div className={styles.prod}>
        <div>
          <h3>{product.name || "Unknown product"}</h3>
          <p>{product.brand || product.barcode}</p>
        </div>
      </div>

      {nova && nova.group > 0 && (
        <div className={styles.novaWrap}>
          <button
            className={`${styles.nova} ${nova.group === 4 ? styles.nova4 : ""}`}
            onClick={() => novaExp && setNovaOpen((v) => !v)}
            aria-expanded={novaExp ? novaOpen : undefined}
          >
            <span className={styles.novaBadge}>NOVA {nova.group}</span>
            <span className={styles.novaLabel}>{nova.label}</span>
            {novaExp && <span className={styles.why}>{novaOpen ? "Hide" : "Why?"}</span>}
          </button>
          {novaOpen && novaExp && (
            <div className={styles.explain}>
              <p>{novaExp.body}</p>
              <p className={styles.source}>Source: {novaExp.source}</p>
            </div>
          )}
        </div>
      )}

      <div className={styles.flags}>
        {score.positives.map((p) => <ReasonChip key={`p-${p}`} reason={p} kind="pos" />)}
        {score.negatives.map((n) => <ReasonChip key={`n-${n}`} reason={n} kind="neg" />)}
      </div>

      <button className={styles.seebreak} onClick={() => setOpen((v) => !v)}>
        {open ? "▴ Hide" : "▾ See full breakdown"}
      </button>
      {open && <div className={styles.detail}><Breakdown score={score} /></div>}

      <button className={styles.again} onClick={onScanAgain}>Scan another</button>
    </div>
  );
}
