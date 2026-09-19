import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { publishNow } from "../../../actions";
import { btnPrimary, btnWarn, Flash, PageHeader } from "../../../_components/ui";
import { getDraft, isBlocked, needsConfirmation, publishChecks } from "@/lib/queue-core";

const VISUAL: Record<string, string> = { carousel: "PDF carousel", image: "Image card", video: "Short video" };

export default async function PublishNow({ params, searchParams }: PageProps<"/drafts/[id]/publish">) {
  await connection();
  const [{ id: rawId }, sp] = await Promise.all([params, searchParams]);
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();
  const draft = await getDraft(id).catch(() => null);
  if (!draft) notFound();

  const checks = await publishChecks(id);
  const blocked = isBlocked(checks);
  const confirm = needsConfirmation(checks);
  const blocks = checks.filter((c) => c.level === "block");
  const warnings = checks.filter((c) => c.level === "confirm");
  const notes = checks.filter((c) => c.level === "info");
  const visual = draft.mediaKind && draft.mediaKind !== "none" ? VISUAL[draft.mediaKind] : null;

  return (
    <>
      <p className="mb-4 text-sm">
        <Link href={`/drafts/${id}`} className="font-semibold text-ink underline underline-offset-4">
          Back to the draft
        </Link>
      </p>
      <PageHeader title="Publish now">This skips the schedule and does not need the worker. The post goes to your LinkedIn profile right away.</PageHeader>
      <Flash params={sp} />

      <div className="max-w-2xl space-y-10">
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-ink">What will be posted</h2>
          <div className="border border-rule bg-paper p-5">
            <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-[1.6]">{draft.body}</pre>
          </div>
          <p className="mt-3 text-sm text-muted">
            {draft.body.length.toLocaleString("en-US")} characters. Visual: {visual ?? "none, text only"}.
          </p>
        </section>

        {blocks.length > 0 ? (
          <section role="alert">
            <h2 className="mb-3 text-lg font-semibold tracking-tight text-pencil">This cannot be published yet</h2>
            <ul className="space-y-2">
              {blocks.map((c) => (
                <li key={c.message} className="border-l-4 border-pencil bg-paper px-4 py-3 text-[15px] leading-relaxed">
                  {c.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {warnings.length > 0 ? (
          <section>
            <h2 className="mb-3 text-lg font-semibold tracking-tight text-ink">Read this before you publish</h2>
            <ul className="space-y-2">
              {warnings.map((c) => (
                <li key={c.message} className="border-l-4 border-pencil bg-paper px-4 py-3 text-[15px] leading-relaxed">
                  {c.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {notes.length > 0 ? (
          <section>
            <h2 className="mb-3 text-lg font-semibold tracking-tight text-ink">Good to know</h2>
            <ul className="space-y-2 text-[15px] leading-relaxed text-muted">
              {notes.map((c) => (
                <li key={c.message}>{c.message}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {blocked ? null : (
          <form action={publishNow} className="border-t border-rule pt-6">
            <input type="hidden" name="id" value={id} />
            {confirm ? (
              <label className="mb-5 flex max-w-xl cursor-pointer items-start gap-3 text-[15px] leading-relaxed">
                <input type="checkbox" name="ack" value="yes" required className="mt-1 size-4 accent-[var(--color-pencil)]" />
                <span>I have read the warnings above. I understand this goes outside my usual limits and I want to publish anyway.</span>
              </label>
            ) : null}
            <div className="flex flex-wrap items-center gap-5">
              <button className={confirm ? btnWarn : btnPrimary}>{confirm ? "Publish anyway" : "Publish now"}</button>
              <Link href={`/drafts/${id}`} className="text-sm font-semibold text-ink underline underline-offset-4">
                Cancel
              </Link>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">Once it is live you can still take it down from the Posts page.</p>
          </form>
        )}
      </div>
    </>
  );
}
