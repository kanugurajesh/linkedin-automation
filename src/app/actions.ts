"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { STYLES } from "@/lib/formats";
import { spawnJob } from "@/lib/job-spawn";
import { createJob, runningJob } from "@/lib/jobs";
import { checkAuth } from "@/lib/linkedin/client";
import { runQueue } from "@/lib/queue-cli";
import { deletePublishedPost, editBody, getDraft, needsConfirmation, publishChecks, recordMetrics, reject, restoreDraft, setPaused } from "@/lib/queue-core";

// These run on the server and are reachable by direct POST, so validate every input here.
// The app has no login: it is meant to run on localhost only (npm run dev/start bind 127.0.0.1).

// `npm run demo` runs on sample data with placeholder keys. These actions reach external services
// (AI, web research, LinkedIn), so in demo mode they refuse instead of trying.
const DEMO_MESSAGE = "This is the demo. Writing, visuals and publishing are switched off here. Run the app with your own keys to use them.";
const isDemo = () => process.env.DEMO_MODE === "1";

function intField(form: FormData, name: string): number {
  const n = Number(form.get(name));
  if (!Number.isInteger(n) || n < 0) throw new Error(`Bad ${name}`);
  return n;
}

function optionalInt(form: FormData, name: string): number | undefined {
  const raw = String(form.get(name) ?? "").trim();
  return raw === "" ? undefined : intField(form, name);
}

function done(path: string, kind: "ok" | "err", msg: string): never {
  revalidatePath("/", "layout");
  redirect(`${path}?${kind}=${encodeURIComponent(msg.slice(0, 500))}`);
}

/** Runs `fn`, then redirects with its message. redirect() throws, so it must stay outside the try. */
async function attempt(path: string, fn: () => Promise<string>): Promise<never> {
  let result: { kind: "ok" | "err"; msg: string };
  try {
    result = { kind: "ok", msg: await fn() };
  } catch (e) {
    result = { kind: "err", msg: e instanceof Error ? e.message : String(e) };
  }
  return done(path, result.kind, result.msg);
}

export async function saveDraft(form: FormData) {
  const id = intField(form, "id");
  await attempt(`/drafts/${id}`, async () => {
    await editBody(id, String(form.get("body") ?? ""));
    return "Saved. If the story changed, plan the visual again so it matches.";
  });
}

export async function approveDraft(form: FormData) {
  const id = intField(form, "id");
  const at = String(form.get("at") ?? "").trim();
  if (at && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at) || Number.isNaN(new Date(at).getTime()))) {
    return done(`/drafts/${id}`, "err", "Bad date/time");
  }
  await attempt(`/drafts/${id}`, async () => {
    const r = await runQueue(["approve", String(id), ...(at ? ["--at", at] : [])]);
    if (!r.ok) throw new Error(r.output.split("\n").pop() || "Approve failed");
    return r.output.split("\n").pop() ?? "Scheduled";
  });
}

export async function rejectDraft(form: FormData) {
  const id = intField(form, "id");
  await attempt(`/drafts/${id}`, async () => {
    await reject(id);
    return "Rejected.";
  });
}

const KINDS = new Set(["carousel", "image", "video", "none"]);

/** Starts a job in the background and sends the browser to its progress page. */
async function startJob(kind: "write" | "visual" | "publish", params: Record<string, unknown>): Promise<number> {
  const running = await runningJob(kind);
  if (running) {
    throw new Error(
      kind === "write"
        ? "Another post is already being written. Wait for it to finish, then start this one."
        : `Another ${kind} job is already running (${running.step ?? "working"}). Wait for it to finish.`,
    );
  }
  const id = await createJob(kind, params);
  spawnJob(id);
  return id;
}

export async function startVisual(form: FormData) {
  const id = intField(form, "id");
  if (isDemo()) return done(`/drafts/${id}`, "err", DEMO_MESSAGE);
  const kind = String(form.get("kind") ?? "");
  if (kind && !KINDS.has(kind)) return done(`/drafts/${id}`, "err", "Bad visual type");
  let jobId: number;
  try {
    await getDraft(id);
    jobId = await startJob("visual", { draftId: id, kind });
  } catch (e) {
    return done(`/drafts/${id}`, "err", e instanceof Error ? e.message : String(e));
  }
  redirect(`/jobs/${jobId}`);
}

export type WriteState = { error?: string };
const VISUALS = new Set(["", "auto", "carousel", "image", "video"]);
const STYLE_IDS = new Set(STYLES.map((s) => s.id as string));

/** Validates the New post form, then writes in the background. Returns an error instead of navigating so typed text is kept. */
export async function startWrite(_prev: WriteState, form: FormData): Promise<WriteState> {
  if (isDemo()) return { error: DEMO_MESSAGE };
  const text =(name: string) => String(form.get(name) ?? "").trim();
  const topic = text("topic");
  const take = text("take");
  const angle = text("angle");
  const url = text("url");
  const visual = text("visual");
  const formats = form.getAll("formats").map(String).filter((f) => STYLE_IDS.has(f));
  const topicIdRaw = text("topicId");

  if (!topic) return { error: "Add a topic so the AI knows what to research." };
  if (topic.length > 200) return { error: "Keep the topic under 200 characters. Put the detail in your take." };
  if (take.length < 10) return { error: "Your take is what makes the post yours. Write at least a sentence about what you think." };
  if (take.length > 1200) return { error: "Keep your take under 1,200 characters. A few sentences is enough." };
  if (angle.length > 300) return { error: "Keep the angle under 300 characters." };
  if (url) {
    let ok = false;
    try {
      ok = ["http:", "https:"].includes(new URL(url).protocol) && url.length <= 500;
    } catch {
      /* not a URL */
    }
    if (!ok) return { error: "The source link must be a full web address starting with https://." };
  }
  if (formats.length === 0) return { error: "Pick at least one writing style." };
  if (formats.length > 3) return { error: "Pick at most three styles at a time. Each one takes extra time." };
  if (!VISUALS.has(visual)) return { error: "Pick a visual from the list." };
  const topicId = /^\d+$/.test(topicIdRaw) ? Number(topicIdRaw) : undefined;

  let jobId: number;
  try {
    jobId = await startJob("write", { topic, url: url || undefined, angle: angle || undefined, take, formats, visual: visual || undefined, topicId });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  redirect(`/jobs/${jobId}`);
}

/** Publishes outside the schedule. The server re-checks the warnings itself: the browser cannot skip the confirmation. */
export async function publishNow(form: FormData) {
  const id = intField(form, "id");
  const here = `/drafts/${id}/publish`;
  if (isDemo()) return done(here, "err", DEMO_MESSAGE);
  const acknowledged = form.get("ack") === "yes";
  let jobId: number | undefined;
  let failure: string | undefined;
  // redirect() works by throwing, so it must only run after this try/catch, never inside it.
  try {
    const checks = await publishChecks(id);
    const block = checks.find((c) => c.level === "block");
    if (block) {
      failure = block.message;
    } else if (needsConfirmation(checks) && !acknowledged) {
      failure = "Tick the box to confirm you want to publish anyway. Nothing was published.";
    } else {
      const auth = await checkAuth().catch((e: unknown) => e);
      if (auth instanceof Error) {
        failure = "LinkedIn rejected the sign-in token, so nothing was published. Run npm run linkedin:auth in the terminal, then try again.";
      } else {
        jobId = await startJob("publish", { draftId: id, ack: acknowledged });
      }
    }
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }
  if (jobId === undefined) return done(here, "err", failure ?? "Could not start publishing.");
  redirect(`/jobs/${jobId}`);
}

export async function restoreDraftAction(form: FormData) {
  const id = intField(form, "id");
  await attempt(`/drafts/${id}`, async () => {
    await restoreDraft(id);
    return "Restored. You can edit, schedule or publish it again.";
  });
}

/** Takes a published post down from LinkedIn. Requires the confirmation field, checked here on the server. */
export async function removePost(form: FormData) {
  const id = intField(form, "post");
  if (isDemo()) return done("/posts", "err", DEMO_MESSAGE);
  if (form.get("confirm") !== "yes") return done("/posts", "err", "Deletion was not confirmed. Nothing was deleted.");
  await attempt("/posts", async () => {
    await deletePublishedPost(id);
    return "Deleted from LinkedIn. The draft is back in your drafts so you can edit and publish it again.";
  });
}

export async function togglePause(form: FormData) {
  const paused = form.get("paused") === "true";
  // Return to the page the switch was used on, but only to a known route.
  const back = String(form.get("back") ?? "/");
  const safeBack = /^\/(trends|posts|drafts(\/\d+)?)?$/.test(back) ? back : "/";
  await attempt(safeBack, async () => {
    await setPaused(paused);
    return paused ? "Paused: the worker will not publish." : "Resumed.";
  });
}

export async function saveMetrics(form: FormData) {
  const id = intField(form, "post");
  await attempt("/posts", async () => {
    await recordMetrics(id, {
      impressions: optionalInt(form, "impressions"),
      reactions: optionalInt(form, "reactions"),
      comments: optionalInt(form, "comments"),
    });
    return `Saved metrics for post #${id}.`;
  });
}
