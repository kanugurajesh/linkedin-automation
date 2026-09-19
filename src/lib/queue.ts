import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { MediaSpec } from "../../remotion/types";
import { planMedia, type MediaKind } from "./ai/media";
import { db, drafts, posts, settings } from "./db";
import { ensureMedia } from "./publish";
import { renderSpec } from "./media/render";
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

/** Times already claimed by scheduled posts or posts published this month, for slot picking. */
export async function takenTimes(): Promise<Date[]> {
  const scheduled = await db.select({ at: drafts.scheduledAt }).from(drafts).where(inArray(drafts.status, ["scheduled", "publishing"]));
  const since = new Date(Date.now() - 35 * 86_400_000);
  const published = await db.select({ at: posts.publishedAt }).from(posts).where(gte(posts.publishedAt, since));
  return [...scheduled.map((s) => s.at), ...published.map((p) => p.at)].filter((t): t is Date => t instanceof Date);
}

/** Plan (via LLM) and render the visual for a draft. `kind: "none"` removes it. */
export async function setMedia(id: number, kind?: MediaKind) {
  const d = await getDraft(id);
  if (kind === "none") {
    await db.update(drafts).set({ mediaKind: "none", mediaSpec: null, mediaPath: null }).where(eq(drafts.id, id));
    return null;
  }
  const spec = await planMedia(d.body, d.facts ?? [], kind);
  if (!spec) {
    await db.update(drafts).set({ mediaKind: "none", mediaSpec: null, mediaPath: null }).where(eq(drafts.id, id));
    return null;
  }
  const rendered = await renderSpec(id, spec);
  await db.update(drafts).set({ mediaKind: spec.kind, mediaSpec: spec, mediaPath: rendered.path }).where(eq(drafts.id, id));
  return { spec, path: rendered.path };
}

/** Approve = render media if needed and put the draft in the next free slot (or `at`). */
export async function approve(id: number, at?: Date): Promise<Date> {
  const d = await getDraft(id);
  if (!["draft", "failed"].includes(d.status)) throw new Error(`Draft #${id} is "${d.status}", only draft/failed can be approved`);
  if (at && at.getTime() < Date.now() + 60_000) throw new Error("--at must be in the future");
  await ensureMedia(d); // fail now, not at 9am
  const when = at ?? nextSlot(await takenTimes());
  await db.update(drafts).set({ status: "scheduled", scheduledAt: when, error: null }).where(eq(drafts.id, id));
  return when;
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
  const text = body.trim();
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
