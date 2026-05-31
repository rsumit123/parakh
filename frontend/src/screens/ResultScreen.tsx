import { useState } from "react";
import type { Product } from "../api/types";
import { gradeTone } from "../scan/grade";
import { ScoreRing } from "../components/ScoreRing";
import { AtAGlance } from "../components/AtAGlance";
import { Breakdown } from "./Breakdown";
import { explanationForReason, explanationForNova, type Explanation } from "../scan/explanations";
import { shareResult } from "../scan/shareCard";
import styles from "./ResultScreen.module.css";

/** One "what this means" card: headline reason + actionable tip, with the cited
 *  science tucked behind a "Why?" toggle. */
function ReasonCard({ reason, kind, exp }: { reason: string; kind: "pos" | "neg"; exp: Explanation | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`${styles.card} ${styles[kind]}`}>
      <div className={styles.cardHead}>
        <span className={styles.ic}>{kind === "pos" ? "✓" : "!"}</span>
        <span className={styles.reasonText}>{reason}</span>
        {exp && (
          <button className={styles.why} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "Hide" : "Why?"}
          </button>
        )}
      </div>
      {exp && <p className={styles.tip}>{exp.tip}</p>}
      {open && exp && (
        <div className={styles.explain}>
          <p>{exp.body}</p>
          <p className={styles.source}>Source: {exp.source}</p>
        </div>
      )}
    </div>
  );
}

interface Props {
  product: Product;
  alternatives?: Product[];
  onScanAgain: () => void;
  onOpenProduct?: (p: Product) => void;
}

export function ResultScreen({ product, alternatives = [], onScanAgain, onOpenProduct }: Props) {
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { score } = product;
  const tone = gradeTone(score.grade);
  const nova = score.breakdown.nova;
  const hasReasons = score.positives.length > 0 || score.negatives.length > 0;

  const onShare = async () => {
    setSharing(true);
    try {
      await shareResult(product);
    } catch {
      /* user cancelled the share sheet, or it's unavailable — no-op */
    } finally {
      setSharing(false);
    }
  };

  // Build ONE keyed list of reason cards (negatives, then NOVA, then positives) so
  // React keeps each card's expand state isolated. Mixing several .map() arrays with
  // a standalone element as siblings makes React reconcile positionally and leak
  // state between cards.
  const reasonCards = [
    ...score.negatives.map((n) => ({
      key: `n-${n}`, reason: n, kind: "neg" as const, exp: explanationForReason(n),
    })),
    ...(nova && nova.group === 4
      ? [{ key: "nova-4", reason: "Ultra-processed (NOVA 4)", kind: "neg" as const, exp: explanationForNova(4) }]
      : []),
    ...score.positives.map((p) => ({
      key: `p-${p}`, reason: p, kind: "pos" as const, exp: null,
    })),
  ];

  return (
    <div className={styles.screen}>
      <div className={`${styles.hero} ${styles[tone]}`}>
        <div className={styles.scoreLabel}>NUTRI-SCORE</div>
        <ScoreRing grade={score.grade} overall={score.overall} />
        <div className={styles.verdict}>{score.verdict}</div>
        {nova && nova.group >= 3 && (
          <div className={styles.novaPill}>NOVA {nova.group} · {nova.label}</div>
        )}
      </div>

      <div className={styles.prod}>
        <div>
          <h3>{product.name || "Unknown product"}</h3>
          <p>{product.brand || product.barcode}</p>
        </div>
      </div>

      <AtAGlance nutrients={score.breakdown.nutrients} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>What this means for you</div>
        <div className={styles.cards}>
          {reasonCards.map((c) => (
            <ReasonCard key={c.key} reason={c.reason} kind={c.kind} exp={c.exp} />
          ))}
          {!hasReasons && (
            <div className={styles.clean}>
              <span className={styles.cleanEmoji}>🌿</span>
              <div>
                <b>Nothing to flag here.</b>
                <span>No standout nutrients of concern — a solid everyday choice.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <button className={styles.seebreak} onClick={() => setOpen((v) => !v)}>
        {open ? "▴ Hide ingredients & full numbers" : "▾ Ingredients & full numbers"}
      </button>
      {open && (
        <div className={styles.detail}>
          <Breakdown score={score} />
          {product.ingredients.length > 0 && (
            <div className={styles.ingredients}>
              <div className={styles.sectionTitle}>Ingredients</div>
              <p>{product.ingredients.join(", ")}</p>
            </div>
          )}
        </div>
      )}

      {alternatives.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Healthier options</div>
          <div className={styles.alts}>
            {alternatives.map((a) => (
              <button
                key={a.barcode}
                className={styles.alt}
                onClick={() => onOpenProduct?.(a)}
              >
                <span className={`${styles.altGrade} ${styles[gradeTone(a.score.grade)]}`}>
                  {a.score.grade}
                </span>
                <span className={styles.altInfo}>
                  <span className={styles.altName}>{a.name || "Unknown product"}</span>
                  <span className={styles.altMeta}>{a.score.overall}/100 · {a.brand || a.category}</span>
                </span>
                <span className={styles.altChev}>›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <button className={styles.share} onClick={onShare} disabled={sharing}>
          {sharing ? "Preparing…" : "↗ Share"}
        </button>
        <button className={styles.again} onClick={onScanAgain}>Scan another</button>
      </div>
    </div>
  );
}
