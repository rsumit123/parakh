import type { Tab } from "../session/nav";
import styles from "./TabBar.module.css";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "explore", label: "Explore", icon: "🔍" },
  { id: "history", label: "History", icon: "🕘" },
];

export function TabBar({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  return (
    <nav className={styles.bar}>
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`${styles.tab} ${active === t.id ? styles.on : ""}`}
          aria-current={active === t.id ? "page" : undefined}
          onClick={() => onSelect(t.id)}
        >
          <span className={styles.icon}>{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
