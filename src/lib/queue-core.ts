import { existsSync } from "node:fs";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { schedule } from "../../config/schedule";
import { db, drafts, posts, settings } from "./db";
import { getEnv } from "./env";
import { LinkedInError } from "./linkedin/client";
import { deletePost } from "./linkedin/posts";
import { currentWeek, localDay, nextSlot } from "./schedule";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function getDraft(id: number) {
  const [d] = await db.select().from(drafts).where(eq(drafts.id, id));
  if (!d) throw new Error(`No draft #${id}`);
  return d;
}

export async function listDrafts(status?: string) {
  const rows = await db.select().from(drafts).orderBy(desc(drafts.id));
  return status ? rows.filter((d) => d.status === status) : rows;
}

export type Check = {
  /** block: cannot publish. confirm: allowed only if the user explicitly overrides. info: worth knowing. */
  level: "block" | "confirm" | "info";
  message: string;
};

export const isBlocked = (checks: Check[]) => checks.some((c) => c.level === "block");
export const needsConfirmation = (checks: Check[]) => checks.some((c) => c.level === "confirm");

/**
 * Everything to tell the user before an out-of-schedule "publish now". One source of truth for the
 * dashboard, the job that publishes, and the CLI, so the safety rules cannot drift apart.
 */
export async function publishChecks(draftId: number, now = new Date()): Promise<Check[]> {
  const d = await getDraft(draftId);
  const checks: Check[] = [];

  if (["published", "publishing"].includes(d.status)) {
    return [{ level: "block", message: `This draft is already ${d.status}.` }];
  }
  if (d.status === "rejected") checks.push({ level: "block", message: "This draft was rejected. Restore it from its page before publishing." });
  if (!d.body.trim()) checks.push({ level: "block", message: "The post text is empty." });
  if (d.body.length > 3000) {
    checks.push({ level: "block", message: `The post is ${d.body.length.toLocaleString("en-US")} characters. LinkedIn allows at most 3,000. Shorten it first.` });
  }

  const { MAX_POSTS_PER_WEEK: cap } = getEnv("MAX_POSTS_PER_WEEK");
  const week = new Set(currentWeek(now).map((day) => day.ymd));
  const inWeek = (t: Date | null | undefined) => !!t && week.has(localDay(t).ymd);
  const since = new Date(now.getTime() - 35 * 86_400_000);
  const recent = await db.select().from(posts).where(gte(posts.publishedAt, since));
  const scheduled = await db.select({ id: drafts.id, at: drafts.scheduledAt }).from(drafts).where(eq(drafts.status, "scheduled"));

  const publishedThisWeek = recent.filter((p) => inWeek(p.publishedAt)).length;
  const scheduledThisWeek = scheduled.filter((s) => s.id !== draftId && inWeek(s.at)).length;
  const last7 = recent.filter((p) => p.publishedAt.getTime() > now.getTime() - 7 * 86_400_000).length;
  const inWeekTotal = publishedThisWeek + scheduledThisWeek;

  if (inWeekTotal >= cap) {
    checks.push({
      level: "confirm",
      message: `You are over your weekly limit. This week already has ${inWeekTotal} of ${cap} posts (${publishedThisWeek} published, ${scheduledThisWeek} scheduled). This would be number ${inWeekTotal + 1}.`,
    });
  } else if (last7 >= cap) {
    checks.push({ level: "confirm", message: `You are over your weekly limit. You published ${last7} posts in the last 7 days and the limit is ${cap}.` });
  }

  const lastPost = recent.reduce<Date | null>((latest, p) => (!latest || p.publishedAt > latest ? p.publishedAt : latest), null);
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

  if (await isPaused()) {
    checks.push({ level: "confirm", message: "Publishing is paused. This manual post ignores the pause switch." });
  }

  const l = localDay(now);
  const hour = Number(l.hm.slice(0, 2));
  if (!(schedule.days as readonly number[]).includes(l.dow) || hour < 8 || hour >= 19) {
    checks.push({ level: "info", message: `It is ${l.hm} local time. Your usual slots are ${schedule.times.join(" or ")} on ${schedule.days.map((n) => DAY_NAMES[n]).join(", ")}.` });
  }
  if (d.status === "scheduled" && d.scheduledAt) {
    checks.push({ level: "info", message: "This draft is scheduled. Publishing now cancels its slot." });
  }
  if (d.mediaSpec && d.mediaKind !== "none" && !(d.mediaPath && existsSync(d.mediaPath))) {
    checks.push({ level: "info", message: "The visual is not rendered yet. It will render first, which can take about a minute." });
  }
  if (d.firstComment) {
    checks.push({ level: "info", message: "LinkedIn does not let this app add the first comment. You will get the text to paste under the post." });
  }
  return checks;
}

/** Times already claimed by scheduled posts or posts published this month, for slot picking. */
export async function takenTimes(): Promise<Date[]> {
  const scheduled = await db.select({ at: drafts.scheduledAt }).from(drafts).where(inArray(drafts.status, ["scheduled", "publishing"]));
  const since = new Date(Date.now() - 35 * 86_400_000);
  const published = await db.select({ at: posts.publishedAt }).from(posts).where(gte(posts.publishedAt, since));
  return [...scheduled.map((s) => s.at), ...published.map((p) => p.at)].filter((t): t is Date => t instanceof Date);
}

/**
 * Put a draft in the next free slot (or `at`). Does not render media: the publisher renders at
 * publish time. Use `approve` (queue.ts) from the CLI to render first, so failures surface now.
 */
export async function scheduleDraft(id: number, at?: Date): Promise<Date> {
  const d = await getDraft(id);
  if (!["draft", "failed"].includes(d.status)) throw new Error(`Draft #${id} is "${d.status}", only draft/failed can be approved`);
  if (at && at.getTime() < Date.now() + 60_000) throw new Error("--at must be in the future");
  const when = at ?? nextSlot(await takenTimes());
  await db.update(drafts).set({ status: "scheduled", scheduledAt: when, error: null }).where(eq(drafts.id, id));
  return when;
}

/** Bring a rejected draft back so it can be edited, scheduled or published. */
export async function restoreDraft(id: number) {
  const d = await getDraft(id);
  if (d.status !== "rejected") throw new Error(`Draft #${id} is "${d.status}", only rejected drafts can be restored`);
  await db.update(drafts).set({ status: "draft" }).where(eq(drafts.id, id));
}

export async function reject(id: number) {
  const d = await getDraft(id);
  if (["published", "publishing"].includes(d.status)) throw new Error(`Draft #${id} is already ${d.status}`);
  await db.update(drafts).set({ status: "rejected", scheduledAt: null }).where(eq(drafts.id, id));
}

/** Replace the text. If a visual was planned it stays; re-run `media` if the story changed. */
export async function editBody(id: number, body: string) {
  const d = await getDraft(id);
  if (["published", "publishing"].includes(d.status)) throw new Error(`Draft #${id} is already ${d.status}`);
  const text = body.replace(/\r\n?/g, "\n").trim(); // browsers and Windows files use CRLF; LinkedIn text should not
  await db.update(drafts).set({ body: text, hook: text.split("\n")[0] ?? "" }).where(eq(drafts.id, id));
}

export async function isPaused(): Promise<boolean> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "paused"));
  return row?.value === true;
}

export async function setPaused(paused: boolean) {
  await db.insert(settings).values({ key: "paused", value: paused }).onConflictDoUpdate({ target: settings.key, set: { value: paused } });
}

export async function recordMetrics(postId: number, m: { impressions?: number; reactions?: number; comments?: number }) {
  const [p] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!p) throw new Error(`No post #${postId}`);
  await db.update(posts).set(m).where(eq(posts.id, postId));
}

/** Published posts with their LinkedIn link and any metrics entered so far. */
export async function listPosts() {
  const rows = await db
    .select({ post: posts, draft: drafts })
    .from(posts)
    .innerJoin(drafts, eq(posts.draftId, drafts.id))
    .orderBy(desc(posts.publishedAt));
  return rows.map(({ post, draft }) => ({
    id: post.id,
    publishedAt: post.publishedAt,
    url: `https://www.linkedin.com/feed/update/${post.linkedinUrn}/`,
    hook: draft.hook,
    format: `${draft.format} + ${draft.mediaKind ?? "none"}`,
    impressions: post.impressions,
    reactions: post.reactions,
    comments: post.comments,
  }));
}

/**
 * Bulk-enter metrics from CSV text. Header row required; `post` (the id from `queue posts`)
 * plus any of impressions, reactions, comments. Nothing is written if any row is invalid.
 */
export async function importMetrics(csv: string): Promise<number> {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (lines.length < 2) throw new Error("CSV needs a header row and at least one data row");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col("post") < 0) throw new Error('CSV header must include a "post" column (the id from `queue posts`)');
  const fields = ["impressions", "reactions", "comments"] as const;
  if (!fields.some((f) => col(f) >= 0)) throw new Error("CSV header needs at least one of: impressions, reactions, comments");

  const updates: { id: number; m: Partial<Record<(typeof fields)[number], number>> }[] = [];
  for (const [i, line] of lines.slice(1).entries()) {
    const cells = line.split(",").map((c) => c.trim());
    const id = Number(cells[col("post")]);
    if (!Number.isInteger(id)) throw new Error(`Row ${i + 2}: bad post id "${cells[col("post")]}"`);
    const m: Partial<Record<(typeof fields)[number], number>> = {};
    for (const f of fields) {
      if (col(f) < 0 || cells[col(f)] === "" || cells[col(f)] === undefined) continue;
      const n = Number(cells[col(f)].replaceAll(",", ""));
      if (!Number.isInteger(n) || n < 0) throw new Error(`Row ${i + 2}: bad ${f} "${cells[col(f)]}"`);
      m[f] = n;
    }
    updates.push({ id, m });
  }

  const known = new Set((await db.select({ id: posts.id }).from(posts)).map((p) => p.id));
  const missing = updates.filter((u) => !known.has(u.id)).map((u) => u.id);
  if (missing.length) throw new Error(`Unknown post id(s): ${missing.join(", ")}. Nothing was saved.`);

  for (const u of updates) if (Object.keys(u.m).length) await db.update(posts).set(u.m).where(eq(posts.id, u.id));
  return updates.length;
}

/** Which formats and media perform, from the numbers you entered. */
export async function stats() {
  const rows = await db
    .select({ post: posts, draft: drafts })
    .from(posts)
    .innerJoin(drafts, eq(posts.draftId, drafts.id))
    .where(and(gte(posts.publishedAt, new Date(0))));
  const groups = new Map<string, { n: number; measured: number; impressions: number; reactions: number; comments: number }>();
  for (const { post, draft } of rows) {
    const key = `${draft.format} + ${draft.mediaKind ?? "none"}`;
    const g = groups.get(key) ?? { n: 0, measured: 0, impressions: 0, reactions: 0, comments: 0 };
    g.n++;
    if (post.impressions != null) {
      g.measured++;
      g.impressions += post.impressions;
      g.reactions += post.reactions ?? 0;
      g.comments += post.comments ?? 0;
    }
    groups.set(key, g);
  }
  return [...groups.entries()].map(([key, g]) => ({
    combo: key,
    posts: g.n,
    withMetrics: g.measured,
    avgImpressions: g.measured ? Math.round(g.impressions / g.measured) : null,
    avgReactions: g.measured ? Math.round(g.reactions / g.measured) : null,
    avgComments: g.measured ? Math.round(g.comments / g.measured) : null,
  }));
}

/**
 * Takes a published post down from LinkedIn, then removes it from the weekly count and puts the draft
 * back so it can be edited and published again. A post LinkedIn no longer has (404) counts as deleted.
 */
export async function deletePublishedPost(postId: number) {
  const [p] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!p) throw new Error(`No post #${postId}`);
  try {
    await deletePost(p.linkedinUrn);
  } catch (e) {
    if (!(e instanceof LinkedInError && e.status === 404)) throw e;
  }
  await db.delete(posts).where(eq(posts.id, postId));
  await db.update(drafts).set({ status: "draft", scheduledAt: null, error: null }).where(eq(drafts.id, p.draftId));
}
