import { useState } from "react";
import {
  loadPrefs, savePrefs, syncReminders, requestReminderPermission, remindersSupported,
  REMINDER_MEALS, type ReminderPrefs,
} from "../diet/reminders";
import styles from "./RemindersScreen.module.css";

/** Meal reminders: one switch for all, then each meal on/off with its time. Saved on
 * the phone; a meal you've already logged today isn't reminded. */
export function RemindersScreen({ onBack }: { onBack: () => void }) {
  const [prefs, setPrefs] = useState<ReminderPrefs>(loadPrefs);
  const [denied, setDenied] = useState(false);
  const supported = remindersSupported();

  const apply = async (next: ReminderPrefs) => {
    if (next.enabled && !prefs.enabled && !(await requestReminderPermission())) {
      setDenied(true);
      return;
    }
    setDenied(false);
    setPrefs(next);
    savePrefs(next);
    void syncReminders();
  };
  const setMeal = (k: keyof ReminderPrefs["meals"], v: Partial<ReminderPrefs["meals"]["lunch"]>) =>
    apply({ ...prefs, meals: { ...prefs.meals, [k]: { ...prefs.meals[k], ...v } } });

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <button className={styles.back} onClick={onBack} aria-label="Back">←</button>
        <span>Meal reminders</span><span />
      </div>
      <p className={styles.note}>A gentle nudge at meal times, skipped if you've already logged that meal.</p>

      <label className={styles.master}>
        <span><b>Remind me to log meals</b><em>{prefs.enabled ? "On" : "Off"}</em></span>
        <input type="checkbox" role="switch" className={styles.switch} checked={prefs.enabled}
          disabled={!supported} onChange={(e) => apply({ ...prefs, enabled: e.target.checked })} />
      </label>
      {!supported && <p className={styles.warn}>Reminders work in the Android app.</p>}
      {denied && <p className={styles.warn}>Notifications are blocked for Parakh. Allow them in your phone's Settings → Apps → Parakh → Notifications.</p>}

      <div className={prefs.enabled ? styles.meals : `${styles.meals} ${styles.off}`}>
        {REMINDER_MEALS.map((m) => (
          <div key={m.key} className={styles.row}>
            <input type="checkbox" className={styles.check} checked={prefs.meals[m.key].on} disabled={!prefs.enabled}
              aria-label={`${m.label} reminder`} onChange={(e) => setMeal(m.key, { on: e.target.checked })} />
            <span className={styles.lbl}>{m.label}</span>
            <input type="time" className={styles.time} value={prefs.meals[m.key].time}
              disabled={!prefs.enabled || !prefs.meals[m.key].on} aria-label={`${m.label} reminder time`}
              onChange={(e) => e.target.value && setMeal(m.key, { time: e.target.value })} />
          </div>
        ))}
      </div>
    </div>
  );
}
