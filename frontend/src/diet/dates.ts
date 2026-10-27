// Local-calendar date helpers for the day view. Dates are "YYYY-MM-DD" strings in the
// device's timezone, matching what the client sends as `day` when logging.

const pad = (n: number) => String(n).padStart(2, "0");

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/** e.g. "Mon, 20 Oct". */
export function shortDate(iso: string): string {
  return fromIso(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

/** "Today", "Yesterday", or the short date. */
export function dayTitle(iso: string, today: string): string {
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  return shortDate(iso);
}

/** One-letter weekday for chart labels: M T W T F S S. */
export function weekdayLetter(iso: string): string {
  return "SMTWTFS"[fromIso(iso).getDay()];
}
