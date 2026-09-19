import { connection } from "next/server";
import { removePost, saveMetrics } from "../actions";
import { btnQuiet, btnWarn, Empty, field, Flash, PageHeader, SectionTitle } from "../_components/ui";
import { listPosts, stats } from "@/lib/queue-core";
import { formatLocal } from "@/lib/schedule";

export default async function Posts({ searchParams }: PageProps<"/posts">) {
  await connection();
  const [params, rows, perf] = await Promise.all([searchParams, listPosts(), stats()]);
  const maxImpressions = Math.max(1, ...perf.map((r) => r.avgImpressions ?? 0));

  return (
    <>
      <PageHeader title="Posts">
        LinkedIn does not let this app read your numbers. Open a post on LinkedIn, look at its analytics, and type them in here.
      </PageHeader>
      <Flash params={params} />

      <section className="mb-14">
        <SectionTitle>Published</SectionTitle>
        {rows.length === 0 ? (
          <Empty title="Nothing published yet.">Approve a draft and keep the worker running. Published posts appear here with a link.</Empty>
        ) : (
          <ul className="border-t border-rule">
            {rows.map((p) => (
              <li key={p.id} className="grid gap-x-8 gap-y-4 border-b border-rule py-6 lg:grid-cols-[1fr_auto]">
                <div className="max-w-xl">
                  <p className="line-clamp-2 text-[17px] font-medium leading-snug">{p.hook}</p>
                  <p className="mt-1 text-sm text-muted">
                    Published {formatLocal(p.publishedAt).split(" (")[0]}. Style and visual: {p.format}.{" "}
                    <a href={p.url} target="_blank" rel="noreferrer noopener" className="whitespace-nowrap font-semibold text-proof underline underline-offset-2">
                      Open on LinkedIn
                    </a>
                  </p>
                </div>
                <form action={saveMetrics} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="post" value={p.id} />
                  {(
                    [
                      ["impressions", "Impressions"],
                      ["reactions", "Reactions"],
                      ["comments", "Comments"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="text-sm text-muted">
                      {label}
                      <input type="number" min={0} step={1} name={key} defaultValue={p[key] ?? ""} className={`${field} mt-1 block w-28 tabular-nums`} />
                    </label>
                  ))}
                  <button className={btnQuiet}>Save numbers</button>
                </form>
                <details className="lg:col-span-2">
                  <summary className="cursor-pointer text-sm font-semibold text-pencil underline underline-offset-4">Delete from LinkedIn</summary>
                  <form action={removePost} className="mt-3 max-w-xl space-y-3 border-l-4 border-pencil bg-paper p-4">
                    <input type="hidden" name="post" value={p.id} />
                    <p className="text-[15px] leading-relaxed">This removes the post from your profile. Its reactions and comments go with it. The draft returns to your drafts so you can fix it and publish again.</p>
                    <label className="flex cursor-pointer items-start gap-3 text-[15px]">
                      <input type="checkbox" name="confirm" value="yes" required className="mt-1 size-4 accent-[var(--color-pencil)]" />
                      <span>I want to delete this post from LinkedIn.</span>
                    </label>
                    <button className={btnWarn}>Delete post</button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>What works best</SectionTitle>
        {perf.length === 0 ? (
          <Empty title="Not enough data yet.">Once you enter numbers for a few posts, this compares writing styles and visuals by average impressions.</Empty>
        ) : (
          <table className="w-full max-w-3xl border-t border-rule text-left text-[15px]">
            <caption className="sr-only">Average results by writing style and visual</caption>
            <thead>
              <tr className="border-b border-rule text-sm text-muted">
                <th scope="col" className="py-3 pr-4 font-medium">Style and visual</th>
                <th scope="col" className="py-3 pr-4 font-medium">Posts</th>
                <th scope="col" className="py-3 pr-4 font-medium">Avg impressions</th>
                <th scope="col" className="py-3 pr-4 font-medium">Avg reactions</th>
                <th scope="col" className="py-3 font-medium">Avg comments</th>
              </tr>
            </thead>
            <tbody>
              {perf.map((r) => (
                <tr key={r.combo} className="border-b border-rule align-middle">
                  <th scope="row" className="py-3 pr-4 font-medium">{r.combo}</th>
                  <td className="py-3 pr-4 tabular-nums">
                    {r.posts}
                    {r.withMetrics < r.posts ? <span className="text-muted"> ({r.withMetrics} with numbers)</span> : null}
                  </td>
                  <td className="py-3 pr-4">
                    {r.avgImpressions == null ? (
                      <span className="text-muted">No numbers yet</span>
                    ) : (
                      <span className="flex items-center gap-3">
                        <span className="w-14 tabular-nums">{r.avgImpressions.toLocaleString("en-US")}</span>
                        <span aria-hidden className="h-2 bg-ink" style={{ width: `${Math.max(4, (r.avgImpressions / maxImpressions) * 120)}px` }} />
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 tabular-nums">{r.avgReactions ?? "-"}</td>
                  <td className="py-3 tabular-nums">{r.avgComments ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
