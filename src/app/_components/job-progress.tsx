"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CopyButton } from "./copy-button";
import type { JobView } from "@/lib/jobs-view";

const TITLES: Record<string, { running: string; done: string; failed: string }> = {
  write: { running: "Writing your drafts", done: "Your drafts are ready", failed: "The drafts were not written" },
  visual: { running: "Creating the visual", done: "The visual is ready", failed: "The visual was not created" },
  publish: { running: "Publishing to LinkedIn", done: "Published", failed: "The post was not published" },
};

function useElapsed(since: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  const s = Math.max(0, Math.round((now - since) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export function JobProgress({ initial }: { initial: JobView }) {
  const [job, setJob] = useState(initial);
  const running = job.status === "running";
  const elapsed = useElapsed(job.createdAt, running);

  useEffect(() => {
    if (!running) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
        if (res.ok && !stop) setJob(await res.json());
      } catch {
        /* server restarting or offline: keep the last state and try again */
      }
    };
    const t = setInterval(tick, 2500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [running, job.id]);

  const titles = TITLES[job.kind] ?? TITLES.write;
  const r = job.result ?? {};
  const draftIds = Array.isArray(r.draftIds) ? (r.draftIds as number[]) : [];
  const postUrn = typeof r.postUrn === "string" ? r.postUrn : null;
  const manualComment = typeof r.manualComment === "string" ? r.manualComment : null;

  return (
    <div>
      <h1 className="text-3xl font-bold leading-tight tracking-tight text-ink md:text-4xl">
        {running ? titles.running : job.status === "done" ? titles.done : titles.failed}
      </h1>
      {running ? (
        <p className="mt-2 max-w-xl text-base leading-relaxed text-muted">
          This runs in the background. You can leave this page and come back; nothing stops if you close the tab.
        </p>
      ) : null}

      <div aria-live="polite" className="mt-8 max-w-2xl">
        <ol className="border-t border-rule">
          {job.log.map((step, i) => (
            <li key={i} className="flex items-start gap-3 border-b border-rule py-3 text-[15px]">
              <span aria-hidden className="mt-1.5 inline-block size-2.5 shrink-0 bg-leaf" />
              <span>
                {step}
                <span className="sr-only"> (finished)</span>
              </span>
            </li>
          ))}
          {running && job.step ? (
            <li className="flex items-start justify-between gap-3 border-b border-rule py-3 text-[15px] font-semibold">
              <span className="flex items-start gap-3">
                <span aria-hidden className="mt-1.5 inline-block size-2.5 shrink-0 animate-pulse bg-mark" />
                {job.step}
              </span>
              <span className="text-sm font-normal text-muted tabular-nums">{elapsed}</span>
            </li>
          ) : null}
        </ol>
      </div>

      {job.status === "failed" ? (
        <div role="alert" className="mt-8 max-w-2xl border-l-4 border-pencil bg-paper px-4 py-3 text-[15px] leading-relaxed text-pencil">
          {job.error ?? "Something went wrong."}
          <p className="mt-2 text-text">
            {job.kind === "publish"
              ? "Check the draft page: if it says the post is live, do not publish again."
              : "Nothing else was changed. You can try again."}
          </p>
        </div>
      ) : null}

      {job.status === "done" && job.kind === "write" ? (
        <div className="mt-8 max-w-2xl">
          <p className="mb-3 text-[15px] text-muted">Read each one, edit it, and pick the one you like. Nothing is scheduled or published yet.</p>
          <ul className="border-t border-rule">
            {draftIds.map((id) => (
              <li key={id} className="border-b border-rule">
                <Link href={`/drafts/${id}`} className="flex items-center justify-between py-4 font-semibold text-ink hover:bg-paper">
                  <span>Open draft {id}</span>
                  <span aria-hidden className="text-muted">Review</span>
                </Link>
              </li>
            ))}
          </ul>
          {typeof r.unresolved === "number" && r.unresolved > 0 ? (
            <p className="mt-4 text-sm leading-relaxed text-pencil">
              {r.unresolved} {r.unresolved === 1 ? "draft still has" : "drafts still have"} style issues the automatic checks could not fix. Read carefully before using {r.unresolved === 1 ? "it" : "them"}.
            </p>
          ) : null}
          {Array.isArray(r.visualErrors) && r.visualErrors.length > 0 ? (
            <p className="mt-4 text-sm leading-relaxed text-pencil">The visual failed for some drafts. Open the draft and use Create a visual to retry. {(r.visualErrors as string[]).join(" ")}</p>
          ) : null}
        </div>
      ) : null}

      {job.status === "done" && job.kind === "visual" && job.draftId ? (
        <p className="mt-8">
          <Link href={`/drafts/${job.draftId}`} className="font-semibold text-ink underline underline-offset-4">
            Back to the draft
          </Link>
        </p>
      ) : null}

      {job.status === "done" && job.kind === "publish" ? (
        <div className="mt-8 max-w-2xl space-y-6">
          {postUrn ? (
            <p>
              <a href={`https://www.linkedin.com/feed/update/${postUrn}/`} target="_blank" rel="noreferrer noopener" className="font-semibold text-proof underline underline-offset-4">
                Open the post on LinkedIn
              </a>
            </p>
          ) : null}
          {manualComment ? (
            <section>
              <h2 className="mb-1 text-lg font-semibold tracking-tight text-ink">Paste this as the first comment</h2>
              <p className="mb-3 text-sm leading-relaxed text-muted">LinkedIn does not let this app comment. Paste it under your post now.</p>
              <pre className="mb-3 whitespace-pre-wrap break-words bg-paper p-3 text-sm leading-relaxed">{manualComment}</pre>
              <CopyButton text={manualComment} label="Copy comment" />
            </section>
          ) : null}
          {typeof r.commentFailed === "string" ? <p className="text-sm text-pencil">The first comment could not be added automatically: {r.commentFailed}</p> : null}
          <p className="text-sm text-muted">
            <Link href="/posts" className="font-semibold text-ink underline underline-offset-4">Go to Posts</Link> to log its numbers later, or to delete it if you change your mind.
          </p>
        </div>
      ) : null}

      {!running ? (
        <p className="mt-10 text-sm">
          {job.status === "failed" ? (
            <Link
              href={job.kind === "write" ? "/new" : job.draftId ? (job.kind === "publish" ? `/drafts/${job.draftId}/publish` : `/drafts/${job.draftId}`) : "/drafts"}
              className="font-semibold text-ink underline underline-offset-4"
            >
              {job.kind === "write" ? "Back to the form" : "Back to the draft"}
            </Link>
          ) : (
            <Link href="/drafts" className="font-semibold text-ink underline underline-offset-4">
              All drafts
            </Link>
          )}
        </p>
      ) : null}
    </div>
  );
}
