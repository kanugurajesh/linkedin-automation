import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { approveDraft, planVisual, rejectDraft, saveDraft } from "../../actions";
import { CopyButton } from "../../_components/copy-button";
import { PostEditor } from "../../_components/post-editor";
import { btnDanger, btnPrimary, btnQuiet, field, Flash, StatusMark } from "../../_components/ui";
import { brand } from "../../../../config/brand";
import { getDraft } from "@/lib/queue-core";
import { formatLocal } from "@/lib/schedule";

/** Files rendered for this draft, served through /api/media (never by raw path). */
function mediaFiles(id: number): string[] {
  const dir = path.resolve("out", `draft-${id}`);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.(png|pdf|mp4)$/i.test(f)).sort();
}

const VISUAL_NAME: Record<string, string> = { carousel: "PDF carousel", image: "Image card", video: "Short video", none: "None" };

const FACTS_SHOWN = 5;

function Fact({ claim, url }: { claim: string; url: string }) {
  return (
    <li className="text-sm leading-relaxed">
      {claim}{" "}
      <a href={url} target="_blank" rel="noreferrer noopener" className="font-semibold text-proof underline underline-offset-2">
        Source
      </a>
    </li>
  );
}

function Margin({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-rule py-6 first:border-t-0 first:pt-0">
      <h2 className="mb-3 text-lg font-semibold tracking-tight text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default async function DraftPage({ params, searchParams }: PageProps<"/drafts/[id]">) {
  await connection();
  const [{ id: rawId }, sp] = await Promise.all([params, searchParams]);
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();
  const draft = await getDraft(id).catch(() => null);
  if (!draft) notFound();

  const locked = draft.status === "published" || draft.status === "publishing";
  const canApprove = draft.status === "draft" || draft.status === "failed";
  const hasVisual = !!draft.mediaKind && draft.mediaKind !== "none";
  const files = hasVisual ? mediaFiles(id) : [];

  return (
    <>
      <p className="mb-4 text-sm">
        <Link href="/drafts" className="font-semibold text-ink underline underline-offset-4">
          Back to drafts
        </Link>
      </p>
      <header className="mb-8 max-w-3xl">
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
          <StatusMark status={draft.status} />
          <span>Draft {draft.id}</span>
          <span>Style: {draft.format}</span>
        </div>
        <h1 className="line-clamp-3 text-3xl font-bold leading-tight tracking-tight text-ink">{draft.hook}</h1>
      </header>

      <Flash params={sp} />
      {draft.error ? (
        <div role="alert" className="mb-8 border-l-4 border-pencil bg-paper px-4 py-3 text-sm text-pencil">
          {draft.error}
        </div>
      ) : null}

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="sheet p-6 md:p-10">
          <PostEditor id={draft.id} initial={draft.body} author={brand.name} readOnly={locked} action={saveDraft} />
        </div>

        <div>
          <Margin title="Schedule">
            {locked ? (
              <p className="text-[15px] leading-relaxed text-muted">{draft.status === "published" ? "This post is live on LinkedIn." : "Publishing right now."}</p>
            ) : draft.status === "rejected" ? (
              <p className="text-[15px] leading-relaxed text-muted">Rejected. It will not be published.</p>
            ) : (
              <div className="space-y-4">
                {draft.status === "scheduled" && draft.scheduledAt ? (
                  <p className="text-[15px] leading-relaxed">
                    Goes out <span className="font-semibold text-proof">{formatLocal(draft.scheduledAt)}</span> if the worker is running.
                  </p>
                ) : null}
                {canApprove ? (
                  <form action={approveDraft} className="space-y-3">
                    <input type="hidden" name="id" value={draft.id} />
                    <label className="block text-sm text-muted">
                      Publish at (leave empty for the next free slot)
                      <input type="datetime-local" name="at" className={`${field} mt-1 block w-full`} />
                    </label>
                    <button className={`${btnPrimary} w-full`}>Approve and schedule</button>
                  </form>
                ) : null}
                <form action={rejectDraft}>
                  <input type="hidden" name="id" value={draft.id} />
                  <button className={btnDanger}>{draft.status === "scheduled" ? "Cancel and reject" : "Reject draft"}</button>
                </form>
              </div>
            )}
          </Margin>

          <Margin title="Visual">
            <p className="mb-3 text-[15px] text-muted">
              {hasVisual ? VISUAL_NAME[draft.mediaKind!] : "Text only."}
              {hasVisual && files.length === 0 ? " Planned, not rendered yet. It renders when you approve." : ""}
            </p>
            {files.length > 0 ? (
              <div className="mb-4 grid grid-cols-3 gap-2">
                {files.map((f) => {
                  const url = `/api/media/${id}/${encodeURIComponent(f)}`;
                  if (/\.png$/i.test(f)) {
                    return (
                      <a key={f} href={url} target="_blank" rel="noreferrer noopener" aria-label={`Open ${f}`}>
                        {/* Local rendered file served with no-store caching: next/image optimization adds nothing. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={f} className="w-full border border-rule" />
                      </a>
                    );
                  }
                  if (/\.mp4$/i.test(f)) return <video key={f} src={url} controls className="col-span-3 w-full border border-rule" />;
                  return (
                    <a key={f} href={url} target="_blank" rel="noreferrer noopener" className={`${btnQuiet} col-span-3`}>
                      Open the PDF
                    </a>
                  );
                })}
              </div>
            ) : null}
            {locked ? null : (
              <form action={planVisual} className="space-y-3">
                <input type="hidden" name="id" value={draft.id} />
                <label className="block text-sm text-muted">
                  Format
                  <select name="kind" defaultValue="" className={`${field} mt-1 block w-full`}>
                    <option value="">Let the AI choose</option>
                    <option value="carousel">PDF carousel</option>
                    <option value="image">Image card</option>
                    <option value="video">Short video</option>
                    <option value="none">No visual</option>
                  </select>
                </label>
                <button className={`${btnQuiet} w-full`}>{hasVisual ? "Redo the visual" : "Create a visual"}</button>
                <p className="text-sm text-muted">This can take up to a minute. The page waits.</p>
              </form>
            )}
          </Margin>

          <Margin title="First comment">
            <p className="mb-3 text-sm leading-relaxed text-muted">LinkedIn does not let this app comment. After the post goes live, paste this under it.</p>
            {draft.firstComment ? (
              <>
                <pre className="mb-3 whitespace-pre-wrap break-words bg-paper p-3 text-sm leading-relaxed">{draft.firstComment}</pre>
                <CopyButton text={draft.firstComment} label="Copy comment" />
              </>
            ) : (
              <p className="text-[15px] text-muted">None for this draft.</p>
            )}
          </Margin>

          {draft.facts?.length ? (
            <Margin title="Facts and sources">
              <p className="mb-3 text-sm leading-relaxed text-muted">The writer could only use these. Check the ones you are unsure about.</p>
              <ul className="space-y-3">
                {draft.facts.slice(0, FACTS_SHOWN).map((f, i) => (
                  <Fact key={i} claim={f.claim} url={f.sourceUrl} />
                ))}
              </ul>
              {draft.facts.length > FACTS_SHOWN ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-ink underline underline-offset-4">Show {draft.facts.length - FACTS_SHOWN} more facts</summary>
                  <ul className="mt-3 space-y-3">
                    {draft.facts.slice(FACTS_SHOWN).map((f, i) => (
                      <Fact key={i} claim={f.claim} url={f.sourceUrl} />
                    ))}
                  </ul>
                </details>
              ) : null}
            </Margin>
          ) : null}
        </div>
      </div>
    </>
  );
}
