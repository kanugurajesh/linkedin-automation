"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { editBody, recordMetrics, reject, setPaused } from "@/lib/queue-core";
import { runQueue } from "@/lib/queue-cli";

// These run on the server and are reachable by direct POST, so validate every input here.
// The app has no login: it is meant to run on localhost only (npm run dev/start bind 127.0.0.1).

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

export async function planVisual(form: FormData) {
  const id = intField(form, "id");
  const kind = String(form.get("kind") ?? "");
  if (kind && !KINDS.has(kind)) return done(`/drafts/${id}`, "err", "Bad visual type");
  await attempt(`/drafts/${id}`, async () => {
    const r = await runQueue(["media", String(id), ...(kind ? ["--kind", kind] : [])]);
    if (!r.ok) throw new Error(r.output.split("\n").pop() || "Rendering failed");
    return r.output.split("\n").pop() ?? "Done";
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
