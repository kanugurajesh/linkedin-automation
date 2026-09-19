import Link from "next/link";
import { connection } from "next/server";
import { Empty, first, Flash, PageHeader, StatusMark, statusLabel } from "../_components/ui";
import { listDrafts } from "@/lib/queue-core";
import { formatLocal } from "@/lib/schedule";

const STATUSES = ["draft", "scheduled", "published", "failed", "rejected"];

export default async function Drafts({ searchParams }: PageProps<"/drafts">) {
  await connection();
  const params = await searchParams;
  const requested = first(params.status);
  const status = requested && STATUSES.includes(requested) ? requested : undefined;
  const all = await listDrafts();
  const rows = status ? all.filter((d) => d.status === status) : all;
  const count = (s: string) => all.filter((d) => d.status === s).length;

  const tabs = [{ key: undefined, label: "All", n: all.length }, ...STATUSES.map((s) => ({ key: s, label: statusLabel(s), n: count(s) }))];

  return (
    <>
      <PageHeader title="Drafts">Open a draft to edit it, check the sources, and put it in the calendar.</PageHeader>
      <Flash params={params} />

      <nav aria-label="Filter drafts" className="mb-2 flex flex-wrap gap-x-6 gap-y-1 border-b border-rule">
        {tabs.map((t) => {
          const on = t.key === status;
          return (
            <Link
              key={t.label}
              href={t.key ? `/drafts?status=${t.key}` : "/drafts"}
              aria-current={on ? "page" : undefined}
              className={`-mb-px border-b-2 py-2 text-[15px] ${on ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {t.label} <span className="tabular-nums">{t.n}</span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="mt-6">
          <Empty title={status ? `No ${statusLabel(status).toLowerCase()} drafts.` : "No drafts yet."}>
            {status ? "Pick another filter to see the rest." : "Write one from the terminal with npm run write, using a topic from the Trends page and your own take."}
          </Empty>
        </div>
      ) : (
        <ul>
          {rows.map((d) => (
            <li key={d.id} className="border-b border-rule">
              <Link href={`/drafts/${d.id}`} className="grid gap-x-6 gap-y-2 py-5 hover:bg-paper md:grid-cols-[9rem_1fr_11rem] md:items-baseline">
                <StatusMark status={d.status} />
                <span className="line-clamp-2 text-[17px] font-medium leading-snug">{d.hook}</span>
                <span className="text-sm leading-relaxed text-muted md:text-right">
                  <span className="block">{d.body.length.toLocaleString("en-US")} characters</span>
                  <span className="block">Visual: {d.mediaKind && d.mediaKind !== "none" ? d.mediaKind : "none"}</span>
                  {d.scheduledAt ? <span className="block font-medium text-proof">{formatLocal(d.scheduledAt).split(" (")[0]}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
