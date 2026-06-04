import { useEffect, useState } from "react";
import type { CategoryCount, Product } from "../api/types";
import { fetchCategories, fetchCatalogProducts } from "../api/catalog";
import { gradeTone } from "../scan/grade";
import { Thumb } from "../components/Thumb";
import styles from "./ExploreScreen.module.css";

interface Props {
  token: string;
  onOpenCategory: (category: string) => void;
  onOpenProduct: (p: Product) => void;
}

const EMOJI: Record<string, string> = {
  drinks: "🥤", namkeen: "🥜", "breakfast cereal": "🥣", chocolate: "🍫",
  biscuits: "🍪", "spreads & sauces": "🫙", "condiments & spices": "🧂",
  "ice cream": "🍦", "health drinks": "🥛", "noodles & pasta": "🍜",
  chips: "🍟", bread: "🍞", dairy: "🧀",
};

export function ExploreScreen({ token, onOpenCategory, onOpenProduct }: Props) {
  const [cats, setCats] = useState<CategoryCount[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Product[] | null>(null);

  useEffect(() => {
    let off = false;
    fetchCategories(token).then((r) => !off && setCats(r.categories)).catch(() => !off && setErr(true));
    return () => { off = true; };
  }, [token]);

  useEffect(() => {
    const query = q.trim();
    if (!query) { setResults(null); return; }
    let off = false;
    const id = setTimeout(() => {
      fetchCatalogProducts(token, { q: query, limit: 50 })
        .then((r) => !off && setResults(r.items)).catch(() => !off && setResults([]));
    }, 250);
    return () => { off = true; clearTimeout(id); };
  }, [q, token]);

  return (
    <div className={styles.screen}>
      <h1 className={styles.h1}>Explore</h1>
      <input className={styles.search} placeholder="Search products or brands"
             value={q} onChange={(e) => setQ(e.target.value)} />

      {q.trim() ? (
        <div className={styles.results}>
          {results === null && (
            <div data-testid="explore-loading">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={`${styles.skelRow} skeleton`} />
              ))}
            </div>
          )}
          {results && results.length === 0 && <div className={styles.muted}>No products found.</div>}
          {results && results.map((p) => (
            <button key={p.barcode} className={styles.ritem} onClick={() => onOpenProduct(p)}>
              <Thumb src={p.image_url} alt={p.name || "product"} className={styles.rthumb} />
              <span className={`${styles.grade} ${styles[gradeTone(p.score.grade)]}`}>{p.score.grade}</span>
              <span className={styles.rinfo}>
                <span className={styles.rname}>{p.name || "Unknown product"}</span>
                <span className={styles.rmeta}>{p.score.overall}/100 · {p.category} · {p.brand}</span>
              </span>
            </button>
          ))}
        </div>
      ) : err ? (
        <div className={styles.muted}>Couldn't load categories.</div>
      ) : cats === null ? (
        <div className={styles.tiles} data-testid="explore-loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`${styles.skelTile} skeleton`} />
          ))}
        </div>
      ) : (
        <div className={styles.tiles}>
          {(cats ?? []).map((c) => (
            <button key={c.category}
                    className={`${styles.tile} ${styles[`t_${c.category.split(" ")[0]}`] ?? ""}`}
                    onClick={() => onOpenCategory(c.category)}>
              <span className={styles.em}>{EMOJI[c.category] ?? "🍽️"}</span>
              <span className={styles.tname}>{c.category}</span>
              <span className={styles.tcount}>{c.count} products</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
