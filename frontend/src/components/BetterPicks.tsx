import { useEffect, useState } from "react";
import { fetchCatalogProducts } from "../api/catalog";
import type { Product } from "../api/types";
import { gradeTone } from "../scan/grade";
import { Thumb } from "./Thumb";
import styles from "./BetterPicks.module.css";

// Everyday packaged snacks first: that's where a better pick changes the most.
export const PICK_CATEGORIES: { id: string; label: string }[] = [
  { id: "biscuits", label: "Biscuits" }, { id: "namkeen", label: "Namkeen" }, { id: "chips", label: "Chips" },
  { id: "protein bars", label: "Protein bars" }, { id: "breakfast cereal", label: "Cereal" },
  { id: "drinks", label: "Drinks" }, { id: "chocolate", label: "Chocolate" }, { id: "noodles & pasta", label: "Noodles" },
];

/** The healthiest products in everyday categories, from the graded catalog, so the
 * Scan screen is useful before (and after) your own first scan. */
export function BetterPicks({ token, onOpen }: { token: string; onOpen: (p: Product) => void }) {
  const [cat, setCat] = useState(PICK_CATEGORIES[0].id);
  const [items, setItems] = useState<Product[] | null>(null);
  useEffect(() => {
    let live = true;
    setItems(null);
    fetchCatalogProducts(token, { category: cat, limit: 8 })
      // "better" means it: D and E grades never show up as a pick
      .then((r) => { if (live) setItems(r.items.filter((p) => ["A", "B", "C"].includes(p.score.grade))); })
      .catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [token, cat]);

  return (
    <section className={styles.wrap} aria-label="Better picks">
      <div className={styles.head}>
        <span className={styles.title}>Better picks</span>
        <span className={styles.sub}>Healthiest first, graded from the label</span>
      </div>
      <div className={styles.chips} role="tablist" aria-label="Category">
        {PICK_CATEGORIES.map((c) => (
          <button key={c.id} role="tab" aria-selected={c.id === cat}
            className={c.id === cat ? styles.chipOn : styles.chip} onClick={() => setCat(c.id)}>{c.label}</button>
        ))}
      </div>
      <div className={styles.row}>
        {items === null && [0, 1, 2].map((i) => <div key={i} className={`skeleton ${styles.skel}`} />)}
        {items?.length === 0 && <p className={styles.none}>No good picks in this category yet.</p>}
        {items?.map((p) => (
          <button key={p.barcode} className={styles.card} onClick={() => onOpen(p)} aria-label={`${p.name}, grade ${p.score.grade}`}>
            <Thumb src={p.image_url} alt={p.name || "product"} className={styles.img} />
            <span className={`${styles.grade} ${styles[gradeTone(p.score.grade)]}`}>{p.score.grade}</span>
            <span className={styles.name}>{p.name}</span>
            <span className={styles.brand}>{p.brand}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
