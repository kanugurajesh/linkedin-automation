/**
 * CLI-side queue operations. DB-only operations live in queue-core.ts so the web dashboard can use
 * them without importing Remotion/OpenAI; this file adds the steps that render or call the LLM.
 */
import { eq } from "drizzle-orm";
import { planMedia, type MediaKind } from "./ai/media";
import { db, drafts } from "./db";
import { renderSpec } from "./media/render";
import { ensureMedia } from "./publish";
import { getDraft, scheduleDraft } from "./queue-core";

export * from "./queue-core";

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
  await ensureMedia(d); // fail now, not at 9am
  return scheduleDraft(id, at);
}
