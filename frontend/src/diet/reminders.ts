import { Capacitor } from "@capacitor/core";
import type { Meal } from "../api/diet";
import { toIso } from "./dates";

// Meal reminders as local notifications (no server, nothing leaves the phone).
// Repeating alarms can't skip a meal you've already logged, so instead the next
// DAYS days are planned as one-off notifications and re-planned whenever the app
// learns what's logged today. Someone who stops opening the app stops getting
// nudged after a week, which is the polite default.

export type ReminderMeal = Exclude<Meal, "snack">;
export interface ReminderPrefs { enabled: boolean; meals: Record<ReminderMeal, { on: boolean; time: string }>; }

export const REMINDER_MEALS: { key: ReminderMeal; label: string; body: string }[] = [
  { key: "breakfast", label: "Breakfast", body: "Had breakfast? Log it in a tap 🌅" },
  { key: "lunch", label: "Lunch", body: "Lunch time — snap or add what you ate 🍛" },
  { key: "dinner", label: "Dinner", body: "Log dinner to see how your day added up 🌙" },
];
export const DEFAULT_PREFS: ReminderPrefs = {
  enabled: false,
  meals: { breakfast: { on: true, time: "09:30" }, lunch: { on: true, time: "14:00" }, dinner: { on: true, time: "21:00" } },
};
const DAYS = 7;
const BASE_ID = 7000;  // our notification ids: BASE_ID + day * 10 + meal index
const PREFS_KEY = "parakh.reminders";
const LOGGED_KEY = "parakh.reminders.logged";

export function loadPrefs(): ReminderPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (p && typeof p.enabled === "boolean") return { enabled: p.enabled, meals: { ...DEFAULT_PREFS.meals, ...p.meals } };
  } catch { /* fall through */ }
  return DEFAULT_PREFS;
}
export function savePrefs(p: ReminderPrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export interface Planned { id: number; meal: ReminderMeal; at: Date; title: string; body: string; }

/** Notifications for the next DAYS days: every enabled meal at its time, except
 * today's slots that have passed or are already logged. Pure, for testing. */
export function plan(prefs: ReminderPrefs, loggedToday: Set<Meal>, now: Date = new Date()): Planned[] {
  if (!prefs.enabled) return [];
  const out: Planned[] = [];
  for (let day = 0; day < DAYS; day++) {
    REMINDER_MEALS.forEach((m, i) => {
      const pref = prefs.meals[m.key];
      if (!pref.on) return;
      const [h, min] = pref.time.split(":").map(Number);
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, h, min);
      if (day === 0 && (at <= now || loggedToday.has(m.key))) return;
      out.push({ id: BASE_ID + day * 10 + i, meal: m.key, at, title: m.label, body: m.body });
    });
  }
  return out;
}

export const remindersSupported = () => Capacitor.isNativePlatform();

/** Ask for notification permission; true if granted. */
export async function requestReminderPermission(): Promise<boolean> {
  if (!remindersSupported()) return false;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const cur = await LocalNotifications.checkPermissions();
  if (cur.display === "granted") return true;
  return (await LocalNotifications.requestPermissions()).display === "granted";
}

/** Re-plan our notifications. `loggedToday` = meals already logged today; when not
 * given (app start), the last value the Today screen reported for today is used. */
export async function syncReminders(loggedToday?: Set<Meal>): Promise<void> {
  const today = toIso(new Date());
  if (loggedToday) {
    try { localStorage.setItem(LOGGED_KEY, JSON.stringify({ day: today, meals: [...loggedToday] })); } catch { /* ignore */ }
  } else {
    try {
      const saved = JSON.parse(localStorage.getItem(LOGGED_KEY) ?? "null");
      loggedToday = new Set(saved?.day === today ? saved.meals : []);
    } catch { loggedToday = new Set(); }
  }
  if (!remindersSupported()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const pending = (await LocalNotifications.getPending()).notifications.filter((n) => n.id >= BASE_ID && n.id < BASE_ID + DAYS * 10);
    if (pending.length) await LocalNotifications.cancel({ notifications: pending.map((n) => ({ id: n.id })) });
    const next = plan(loadPrefs(), loggedToday);
    if (!next.length) return;
    if ((await LocalNotifications.checkPermissions()).display !== "granted") return;
    await LocalNotifications.schedule({ notifications: next.map((n) => ({
      id: n.id, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true },
      extra: { open: "today" },
    })) });
  } catch { /* reminders are best-effort */ }
}
