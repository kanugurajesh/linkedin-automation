import { existsSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import type { MediaSpec } from "../../remotion/types";
import { db, drafts, posts } from "./db";
import { getEnv } from "./env";
import { uploadDocument, uploadImage, uploadVideo } from "./linkedin/media";
import { addComment, escapeCommentary, publishPost, type MediaRef } from "./linkedin/posts";
import { renderSpec } from "./media/render";

type Draft = typeof drafts.$inferSelect;

/** Render the draft's planned visual if it hasn't been rendered (or the file is gone). */
export async function ensureMedia(draft: Draft): Promise<string | null> {
  if (!draft.mediaSpec || draft.mediaKind === "none") return null;
  if (draft.mediaPath && existsSync(draft.mediaPath)) return draft.mediaPath;
  const rendered = await renderSpec(draft.id, draft.mediaSpec as MediaSpec);
  await db.update(drafts).set({ mediaPath: rendered.path }).where(eq(drafts.id, draft.id));
  return rendered.path;
}

async function upload(draft: Draft, file: string): Promise<MediaRef> {
  switch (draft.mediaKind) {
    case "carousel":
      return uploadDocument(file, draft.hook.slice(0, 60));
    case "image":
      return uploadImage(file);
    case "video":
      return uploadVideo(file);
    default:
      throw new Error(`Unknown media kind: ${draft.mediaKind}`);
  }
}

export interface PublishResult {
  dryRun: boolean;
  postUrn?: string;
  commentFailed?: string;
  /** Set when auto-comment is off: the text the user should paste as the first comment. */
  manualComment?: string;
}

/**
 * Publishes one draft. The draft is atomically claimed (status -> publishing) so the worker and a
 * manual `publish` can never post it twice. If anything after the post itself fails (comment,
 * DB write) the draft is still recorded as published, because retrying would duplicate the post.
 */
export async function publishDraft(
  id: number,
  opts: { dryRun?: boolean; from?: string[] } = {},
): Promise<PublishResult> {
  const from = opts.from ?? ["scheduled"];
  const [before] = await db.select().from(drafts).where(eq(drafts.id, id));
  if (!before) throw new Error(`No draft #${id}`);

  if (opts.dryRun) {
    if (!from.includes(before.status)) throw new Error(`Draft #${id} is "${before.status}", expected ${from.join("/")}`);
    console.log(`--- DRY RUN draft #${id} ---\n${escapeCommentary(before.body)}\n`);
    console.log(`media: ${before.mediaKind ?? "none"}${before.mediaPath ? ` (${before.mediaPath})` : before.mediaSpec ? " (will render)" : ""}`);
    console.log(`first comment:\n${before.firstComment ?? "(none)"}`);
    return { dryRun: true };
  }

  const claimed = await db
    .update(drafts)
    .set({ status: "publishing", error: null })
    .where(and(eq(drafts.id, id), inArray(drafts.status, from)))
    .returning();
  if (claimed.length === 0) throw new Error(`Draft #${id} is not in ${from.join("/")} (already published or being published?)`);
  const draft = claimed[0];

  let postUrn: string;
  try {
    const file = await ensureMedia(draft);
    const media = file ? await upload(draft, file) : undefined;
    postUrn = await publishPost(draft.body, media);
  } catch (e) {
    await db.update(drafts).set({ status: "failed", error: e instanceof Error ? e.message : String(e) }).where(eq(drafts.id, id));
    throw e;
  }

  // The post is live from here on: nothing below may mark the draft failed.
  await db.insert(posts).values({ draftId: id, linkedinUrn: postUrn, publishedAt: new Date() });
  await db.update(drafts).set({ status: "published" }).where(eq(drafts.id, id));

  let commentFailed: string | undefined;
  if (draft.firstComment && getEnv("LINKEDIN_AUTO_COMMENT").LINKEDIN_AUTO_COMMENT !== "true") {
    return { dryRun: false, postUrn, manualComment: draft.firstComment };
  }
  if (draft.firstComment) {
    try {
      await addComment(postUrn, draft.firstComment);
    } catch (e) {
      commentFailed = e instanceof Error ? e.message : String(e);
      await db.update(drafts).set({ error: `Published, but first comment failed: ${commentFailed}` }).where(eq(drafts.id, id));
    }
  }
  return { dryRun: false, postUrn, commentFailed };
}
