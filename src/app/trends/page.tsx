import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import Link from "next/link";
import { btnPrimary, Empty, PageHeader } from "../_components/ui";
import { db, topics } from "@/lib/db";

const SOURCE: Record<string, string> = { hn: "Hacker News", news: "News search", producthunt: "Product Hunt", manual: "Added by you" };

export default async function Trends() {
  await connection();
  const rows = await db.select().from(topics).where(eq(topics.status, "new")).orderBy(desc(topics.score)).limit(30);

  return (
    <>
      <PageHeader title="Trends">
        Stories ranked by how recent they are, how many outlets cover them, and how much people engage. Refresh the list with <code className="font-semibold text-text">npm run discover</code> in the terminal.
      </PageHeader>

      {rows.length === 0 ? (
        <Empty title="No topics saved yet.">Run npm run discover in the terminal. It searches your niche and lists the best stories here.</Empty>
      ) : (
        <ul className="border-t border-rule">
          {rows.map((t) => {
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
                  <div className="mt-5">
                    <Link href={`/new?topic=${t.id}`} className={btnPrimary}>
                      Write a post from this
                    </Link>
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
