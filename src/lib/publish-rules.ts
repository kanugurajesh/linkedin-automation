import { schedule } from "../../config/schedule";
import { currentWeek, localDay } from "./schedule";

export type Check = {
  /** block: cannot publish. confirm: allowed only if the user explicitly overrides. info: worth knowing. */
  level: "block" | "confirm" | "info";
  message: string;
};

export const isBlocked = (checks: Check[]) => checks.some((c) => c.level === "block");
export const needsConfirmation = (checks: Check[]) => checks.some((c) => c.level === "confirm");

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LINKEDIN_MAX_CHARS = 3000;
const DAY_MS = 86_400_000;

export type RuleDraft = {
  id: number;
  status: string;
  body: string;
  mediaSpec: unknown;
  mediaKind: string | null;
  scheduledAt: Date | null;
  firstComment: string | null;
};

export type RuleInput = {
  draft: RuleDraft;
  /** Posts published in roughly the last month. */
  published: { publishedAt: Date }[];
  /** Every draft currently scheduled, including this one if it is. */
  scheduled: { id: number; at: Date | null }[];
  paused: boolean;
  now: Date;
  /** Weekly post limit. */
  cap: number;
  /** True when the draft's visual already exists on disk. */
  mediaRendered: boolean;
};

/**
 * The rules for a manual "publish now", as a pure function of its inputs (no database, no clock).
 * One source of truth for the dashboard, the job that publishes, and the CLI, so they cannot drift apart.
 */
export function evaluatePublish({ draft: d, published, scheduled, paused, now, cap, mediaRendered }: RuleInput): Check[] {
  if (["published", "publishing"].includes(d.status)) {
    return [{ level: "block", message: `This draft is already ${d.status}.` }];
  }

  const checks: Check[] = [];
  if (d.status === "rejected") checks.push({ level: "block", message: "This draft was rejected. Restore it from its page before publishing." });
  if (!d.body.trim()) checks.push({ level: "block", message: "The post text is empty." });
  if (d.body.length > LINKEDIN_MAX_CHARS) {
    checks.push({ level: "block", message: `The post is ${d.body.length.toLocaleString("en-US")} characters. LinkedIn allows at most 3,000. Shorten it first.` });
  }

  const week = new Set(currentWeek(now).map((day) => day.ymd));
  const inWeek = (t: Date | null | undefined) => !!t && week.has(localDay(t).ymd);
  const publishedThisWeek = published.filter((p) => inWeek(p.publishedAt)).length;
  const scheduledThisWeek = scheduled.filter((s) => s.id !== d.id && inWeek(s.at)).length;
  const last7 = published.filter((p) => p.publishedAt.getTime() > now.getTime() - 7 * DAY_MS).length;
  const inWeekTotal = publishedThisWeek + scheduledThisWeek;

  if (inWeekTotal >= cap) {
    checks.push({
      level: "confirm",
      message: `You are over your weekly limit. This week already has ${inWeekTotal} of ${cap} posts (${publishedThisWeek} published, ${scheduledThisWeek} scheduled). This would be number ${inWeekTotal + 1}.`,
    });
  } else if (last7 >= cap) {
    checks.push({ level: "confirm", message: `You are over your weekly limit. You published ${last7} posts in the last 7 days and the limit is ${cap}.` });
  }

  const lastPost = published.reduce<Date | null>((latest, p) => (!latest || p.publishedAt > latest ? p.publishedAt : latest), null);
  if (lastPost) {
    const hours = (now.getTime() - lastPost.getTime()) / 3_600_000;
    if (hours < schedule.minGapMinutes / 60) {
      const ago = hours < 1 ? `${Math.max(1, Math.round(hours * 60))} minutes` : `${Math.round(hours)} hours`;
      checks.push({
        level: "confirm",
        message: `You published another post ${ago} ago. Posts closer than ${schedule.minGapMinutes / 60} hours apart tend to split each other's reach.`,
      });
    }
  }

  if (paused) checks.push({ level: "confirm", message: "Publishing is paused. This manual post ignores the pause switch." });

  const l = localDay(now);
  const hour = Number(l.hm.slice(0, 2));
  if (!(schedule.days as readonly number[]).includes(l.dow) || hour < 8 || hour >= 19) {
    checks.push({ level: "info", message: `It is ${l.hm} local time. Your usual slots are ${schedule.times.join(" or ")} on ${schedule.days.map((n) => DAY_NAMES[n]).join(", ")}.` });
  }
  if (d.status === "scheduled" && d.scheduledAt) {
    checks.push({ level: "info", message: "This draft is scheduled. Publishing now cancels its slot." });
  }
  if (d.mediaSpec && d.mediaKind !== "none" && !mediaRendered) {
    checks.push({ level: "info", message: "The visual is not rendered yet. It will render first, which can take about a minute." });
  }
  if (d.firstComment) {
    checks.push({ level: "info", message: "LinkedIn does not let this app add the first comment. You will get the text to paste under the post." });
  }
  return checks;
}
