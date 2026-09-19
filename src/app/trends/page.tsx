import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { CopyButton } from "../_components/copy-button";
import { Empty, PageHeader } from "../_components/ui";
import { db, topics } from "@/lib/db";

const SOURCE: Record<string, string> = { hn: "Hacker News", news: "News search", producthunt: "Product Hunt", manual: "Added by you" };

export default async function Trends() {
  await connection();
  const rows = await db.select().from(topics).where(eq(topics.status, "new")).orderBy(desc(topics.score)).limit(30);

  return (
    <>
      <PageHeader title="Trends">
        Stories ranked by how recent they are, how many outlets cover them, and how much people engage. Refresh the list with <code className="font-semibold text-text">npm run discover</code>.
      </PageHeader>

      {rows.length === 0 ? (
        <Empty title="No topics saved yet.">Run npm run discover in the terminal. It searches your niche and lists the best stories here.</Empty>
      ) : (
        <ul className="border-t border-rule">
          {rows.map((t) => {
            const cmd = `npm run write -- --topic ${t.id} --take "your one-line opinion"`;
            return (
              <li key={t.id} className="grid gap-x-8 gap-y-4 border-b border-rule py-7 md:grid-cols-[4.5rem_1fr]">
                <div>
                  <p className="text-4xl font-bold leading-none tracking-tight text-ink tabular-nums">{Math.round(t.score * 100)}</p>
                  <p className="mt-1 text-sm text-muted">score</p>
                </div>
                <div className="max-w-2xl">
                  <h2 className="text-xl font-semibold leading-snug tracking-tight">
                    {t.url ? (
                      <a href={t.url} target="_blank" rel="noreferrer noopener" className="hover:underline">
                        {t.title}
                      </a>
                    ) : (
                      t.title
                    )}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {SOURCE[t.source] ?? t.source}
                    {t.pillar ? <span className="ml-3">Fits {t.pillar}</span> : null}
                  </p>
                  {t.angles?.length ? (
                    <ul className="mt-4 space-y-2">
                      {t.angles.map((a, i) => (
                        <li key={i} className="border-l-2 border-rule pl-3 text-[15px] leading-relaxed">
                          {a}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <code className="min-w-0 max-w-full overflow-x-auto bg-paper px-3 py-2 text-sm">{cmd}</code>
                    <CopyButton text={cmd} label="Copy command" />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
