import { useEffect, useState } from "react";
import type { Product } from "../api/types";
import { fetchCatalogProducts } from "../api/catalog";
import { gradeTone } from "../scan/grade";
import styles from "./CategoryScreen.module.css";

interface Props {
  token: string;
  category: string;
  onOpenProduct: (p: Product) => void;
  onBack: () => void;
}

const GRADES = ["A", "B", "C", "D", "E"];

export function CategoryScreen({ token, category, onOpenProduct, onBack }: Props) {
  const [grade, setGrade] = useState("");
  const [items, setItems] = useState<Product[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let off = false;
    setItems(null);
    fetchCatalogProducts(token, { category, grade, limit: 200 })
      .then((r) => { if (!off) { setItems(r.items); setTotal(r.total); } })
      .catch(() => { if (!off) setItems([]); });
    return () => { off = true; };
  }, [token, category, grade]);

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <button className={styles.back} onClick={onBack} aria-label="Back">‹</button>
        <span className={styles.title}>{category}</span>
        <span className={styles.count}>{total} products</span>
      </div>
      <div className={styles.filter}>
        <span className={styles.flab}>Grade</span>
        <button className={`${styles.chip} ${grade === "" ? styles.on : ""}`} onClick={() => setGrade("")}>All</button>
        {GRADES.map((g) => (
          <button key={g} className={`${styles.chip} ${grade === g ? styles.on : ""}`} onClick={() => setGrade(g)}>{g}</button>
        ))}
      </div>
      {items === null ? (
        <div className={styles.muted}>Loading…</div>
      ) : items.length === 0 ? (
        <div className={styles.muted}>No products here yet.</div>
      ) : (
        <div className={styles.grid}>
          {items.map((p) => (
            <button key={p.barcode} className={styles.card} onClick={() => onOpenProduct(p)}>
              <span className={`${styles.badge} ${styles[gradeTone(p.score.grade)]}`}>{p.score.grade}</span>
              {p.image_url
                ? <img className={styles.img} src={p.image_url} alt={p.name || "product"} />
                : <span className={styles.ph} aria-hidden="true">🛒</span>}
              <span className={styles.nm}>{p.name || "Unknown product"}</span>
              <span className={styles.mt}>{p.score.overall}/100 · {p.brand}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
