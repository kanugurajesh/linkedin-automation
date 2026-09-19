/**
 * Runs one dashboard job (write / visual / publish) in its own process, so a browser tab closing or a
 * page reload never interrupts it. Started by the web app: `tsx scripts/job.ts <jobId>`.
 * Progress and the outcome are written to the jobs table, which the job page polls.
 */
import { eq } from "drizzle-orm";
import { research } from "../src/lib/ai/research";
import { writePosts } from "../src/lib/ai/write";
import { db, topics } from "../src/lib/db";
import { failJob, finishJob, getJob, progress } from "../src/lib/jobs";
import { publishDraft } from "../src/lib/publish";
import { setMedia } from "../src/lib/queue";
import { isBlocked, needsConfirmation, publishChecks } from "../src/lib/queue-core";
import type { MediaKind } from "../src/lib/ai/media";

type WriteParams = { topic: string; url?: string; angle?: string; take: string; formats: string[]; visual?: string; topicId?: number };

async function runWrite(id: number, p: WriteParams) {
  await progress(id, "Searching the web and reading the sources");
  const facts = await research(p.topic, p.url);
  const sources = new Set(facts.map((f) => f.sourceUrl)).size;
  await progress(id, `Found ${facts.length} facts in ${sources} ${sources === 1 ? "source" : "sources"}`);

  const written = await writePosts({
    topicId: p.topicId,
    topic: p.topic,
    angle: p.angle,
    personalTake: p.take,
    facts,
    formats: p.formats,
    onProgress: (step) => progress(id, step),
  });

  const visualErrors: string[] = [];
  if (p.visual) {
    for (const [i, d] of written.entries()) {
      await progress(id, `Creating the visual for draft ${i + 1} of ${written.length} (up to a minute each)`);
      try {
        await setMedia(d.id, p.visual === "auto" ? undefined : (p.visual as MediaKind));
      } catch (e) {
        visualErrors.push(`Draft ${d.id}: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
      }
    }
  }

  if (p.topicId) await db.update(topics).set({ status: "used" }).where(eq(topics.id, p.topicId));
  await finishJob(id, {
    draftIds: written.map((d) => d.id),
    unresolved: written.filter((d) => d.remainingIssues.length > 0).length,
    visualErrors,
  });
}

async function runVisual(id: number, p: { draftId: number; kind?: string }) {
  await progress(id, "Designing and rendering the visual (up to a minute)");
  const kind = p.kind === "" || p.kind === "auto" ? undefined : (p.kind as MediaKind | undefined);
  const r = await setMedia(p.draftId, kind);
  await finishJob(id, { draftId: p.draftId, kind: r ? r.spec.kind : "none" });
}

async function runPublish(id: number, p: { draftId: number; ack?: boolean }) {
  await progress(id, "Checking the post one last time");
  // Defence in depth: the web action already checked, but the rules are re-applied here.
  const checks = await publishChecks(p.draftId);
  const block = checks.find((c) => c.level === "block");
  if (isBlocked(checks) && block) throw new Error(block.message);
  if (needsConfirmation(checks) && !p.ack) throw new Error("This post needs your confirmation to go out of schedule, and it was not given.");

  const r = await publishDraft(p.draftId, {
    from: ["draft", "scheduled", "failed"],
    onProgress: (step) => progress(id, step),
  });
  await finishJob(id, { draftId: p.draftId, postUrn: r.postUrn, manualComment: r.manualComment ?? null, commentFailed: r.commentFailed ?? null });
}

async function main() {
  const id = Number(process.argv[2]);
  if (!Number.isInteger(id)) throw new Error("usage: job.ts <jobId>");
  try {
    const job = await getJob(id);
    if (!job) throw new Error(`No job #${id}`);
    if (job.kind === "write") await runWrite(id, job.params as unknown as WriteParams);
    else if (job.kind === "visual") await runVisual(id, job.params as { draftId: number; kind?: string });
    else if (job.kind === "publish") await runPublish(id, job.params as { draftId: number; ack?: boolean });
    else throw new Error(`Unknown job kind: ${job.kind}`);
  } catch (e) {
    await failJob(id, e instanceof Error ? e.message : String(e));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
