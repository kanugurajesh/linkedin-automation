import { existsSync } from "node:fs";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, drafts, posts, settings } from "./db";
import { getEnv } from "./env";
import { LinkedInError } from "./linkedin/client";
import { deletePost } from "./linkedin/posts";
import { parseMetricsCsv } from "./metrics-csv";
import { evaluatePublish, type Check } from "./publish-rules";
import { nextSlot } from "./schedule";

export async function getDraft(id: number) {
  const [d] = await db.select().from(drafts).where(eq(drafts.id, id));
  if (!d) throw new Error(`No draft #${id}`);
  return d;
}

export async function listDrafts(status?: string) {
  const rows = await db.select().from(drafts).orderBy(desc(drafts.id));
  return status ? rows.filter((d) => d.status === status) : rows;
}

export { isBlocked, needsConfirmation, type Check } from "./publish-rules";

/** Loads what the rules need from the database and applies them. See publish-rules.ts for the rules. */
export async function publishChecks(draftId: number, now = new Date()): Promise<Check[]> {
  const d = await getDraft(draftId);
  const { MAX_POSTS_PER_WEEK: cap } = getEnv("MAX_POSTS_PER_WEEK");
  const since = new Date(now.getTime() - 35 * 86_400_000);
  const published = await db.select().from(posts).where(gte(posts.publishedAt, since));
  const scheduled = await db.select({ id: drafts.id, at: drafts.scheduledAt }).from(drafts).where(eq(drafts.status, "scheduled"));
  return evaluatePublish({ draft: d, published, scheduled, paused: await isPaused(), now, cap, mediaRendered: !!(d.mediaPath && existsSync(d.mediaPath)) });
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
  const updates = parseMetricsCsv(csv);
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
