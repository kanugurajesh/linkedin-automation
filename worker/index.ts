/**
 * Long-running scheduler. Every minute: publish the next due draft, unless paused or the weekly cap is hit.
 * Run with `npm run worker` (keep it running), or `npm run worker -- --once` for a single tick.
 */
import { and, asc, eq, gte, lte } from "drizzle-orm";
import cron from "node-cron";
import { db, drafts, posts } from "../src/lib/db";
import { getEnv } from "../src/lib/env";
import { checkAuth } from "../src/lib/linkedin/client";
import { publishDraft } from "../src/lib/publish";
import { isPaused, takenTimes } from "../src/lib/queue";
import { formatLocal, nextSlot } from "../src/lib/schedule";

const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);
let running = false;

async function tick() {
  if (running) return; // a slow render/upload must not overlap the next tick
  running = true;
  try {
    if (await isPaused()) return;

    const [due] = await db
      .select()
      .from(drafts)
      .where(and(eq(drafts.status, "scheduled"), lte(drafts.scheduledAt, new Date())))
      .orderBy(asc(drafts.scheduledAt))
      .limit(1);
    if (!due) return;

    const { MAX_POSTS_PER_WEEK } = getEnv("MAX_POSTS_PER_WEEK");
    const recent = await db.select().from(posts).where(gte(posts.publishedAt, new Date(Date.now() - 7 * 86_400_000)));
    if (recent.length >= MAX_POSTS_PER_WEEK) {
      const taken = (await takenTimes()).filter((t) => t.getTime() !== due.scheduledAt?.getTime());
      const when = nextSlot(taken, new Date(Date.now() + 86_400_000));
      await db.update(drafts).set({ scheduledAt: when }).where(eq(drafts.id, due.id));
      log(`weekly cap (${MAX_POSTS_PER_WEEK}) reached: draft #${due.id} moved to ${formatLocal(when)}`);
      return;
    }

    log(`publishing draft #${due.id} (${due.format}, media: ${due.mediaKind ?? "none"})`);
    try {
      const r = await publishDraft(due.id);
      log(`published draft #${due.id} -> ${r.postUrn}${r.commentFailed ? ` (first comment failed: ${r.commentFailed})` : ""}`);
      if (r.manualComment) log(`ACTION: paste this as the first comment on the new post (see \`npm run queue -- show ${due.id}\`):\n${r.manualComment}`);
    } catch (e) {
      log(`FAILED draft #${due.id}: ${e instanceof Error ? e.message : e}`);
    }
  } catch (e) {
    log(`tick error: ${e instanceof Error ? e.message : e}`);
  } finally {
    running = false;
  }
}

async function main() {
  try {
    const a = await checkAuth();
    log(`LinkedIn: ${a.name} (token from ${a.source})${a.urnMatches ? "" : " WARNING: configured person URN does not match this token"}`);
  } catch (e) {
    log(`WARNING: LinkedIn auth check failed: ${e instanceof Error ? e.message : e}. Posts will fail until fixed.`);
  }

  if (process.argv.includes("--once")) {
    await tick();
    return;
  }
  log("worker started, checking every minute (Ctrl+C to stop)");
  cron.schedule("* * * * *", tick);
  await tick();
}

main();
