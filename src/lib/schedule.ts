import { schedule } from "../../config/schedule";
import { getEnv } from "./env";

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function local(d: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return { dow: DOW[parts.weekday], ymd: `${parts.year}-${parts.month}-${parts.day}`, hm: `${parts.hour}:${parts.minute}` };
}

/** Monday of the local week, so the weekly cap counts calendar weeks in the user's timezone. */
function weekKey(ymd: string, dow: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Next free posting slot after `after`, skipping slots too close to `taken` posts and weeks
 * that already hit the cap. `taken` = scheduled + recently published times.
 */
export function nextSlot(taken: Date[], after = new Date()): Date {
  const { TIMEZONE, MAX_POSTS_PER_WEEK } = getEnv("TIMEZONE", "MAX_POSTS_PER_WEEK");
  const perWeek = new Map<string, number>();
  for (const t of taken) {
    const l = local(t, TIMEZONE);
    const k = weekKey(l.ymd, l.dow);
    perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
  }

  const STEP = 15 * 60_000;
  const start = Math.ceil((after.getTime() + 10 * 60_000) / STEP) * STEP; // at least 10 min out
  for (let t = start; t < start + 90 * 86_400_000; t += STEP) {
    const d = new Date(t);
    const l = local(d, TIMEZONE);
    if (!(schedule.days as readonly number[]).includes(l.dow)) continue;
    if (!(schedule.times as readonly string[]).includes(l.hm)) continue;
    if ((perWeek.get(weekKey(l.ymd, l.dow)) ?? 0) >= MAX_POSTS_PER_WEEK) continue;
    if (taken.some((x) => Math.abs(x.getTime() - t) < schedule.minGapMinutes * 60_000)) continue;
    return d;
  }
  throw new Error("No free posting slot in the next 90 days: check config/schedule.ts and MAX_POSTS_PER_WEEK");
}

export function formatLocal(d: Date): string {
  const { TIMEZONE } = getEnv("TIMEZONE");
  return `${d.toLocaleString("en-GB", { timeZone: TIMEZONE, dateStyle: "medium", timeStyle: "short" })} (${TIMEZONE})`;
}
