import type { WeighIn } from "../api/diet";
import { addDays } from "./dates";

/** Change from the weigh-in closest to `days` before the latest one (at least
 * days/2 earlier, so two readings a day apart don't count as a week's trend). */
export function weightChange(entries: WeighIn[], days = 7): { kg: number; overDays: number } | null {
  if (entries.length < 2) return null;
  const last = entries[entries.length - 1];
  const want = addDays(last.day, -days);
  const ms = (d: string) => new Date(d).getTime();
  const earlier = entries.slice(0, -1).filter((e) => ms(last.day) - ms(e.day) >= (days / 2) * 864e5);
  if (!earlier.length) return null;
  const ref = earlier.reduce((a, b) => (Math.abs(ms(b.day) - ms(want)) < Math.abs(ms(a.day) - ms(want)) ? b : a));
  return { kg: Math.round((last.weight_kg - ref.weight_kg) * 10) / 10, overDays: Math.round((ms(last.day) - ms(ref.day)) / 864e5) };
}
