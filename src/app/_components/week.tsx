import Link from "next/link";
import { schedule } from "../../../config/schedule";
import { currentWeek, localDay } from "@/lib/schedule";

type Item = { id: number; kind: "scheduled" | "published"; at: Date; label: string; href: string };

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function WeekRow({ title, weeksAhead, items, cap }: { title: string; weeksAhead: number; items: Item[]; cap: number }) {
  const week = currentWeek(new Date(), weeksAhead);
  const today = localDay(new Date()).ymd;
  const byDay = new Map<string, Item[]>();
  for (const it of items) {
    const ymd = localDay(it.at).ymd;
    byDay.set(ymd, [...(byDay.get(ymd) ?? []), it]);
  }
  const used = week.reduce((n, d) => n + (byDay.get(d.ymd)?.length ?? 0), 0);
  const from = week[0].ymd;
  const to = week[6].ymd;
  const fmt = (ymd: string) => `${Number(ymd.slice(8))} ${MONTH[Number(ymd.slice(5, 7)) - 1]}`;

  return (
    <section aria-label={title} className="mb-8 last:mb-0">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4">
        <h3 className="font-semibold text-ink">{title}</h3>
        <span className="text-sm text-muted">
          {fmt(from)} to {fmt(to)}
        </span>
        <span className="text-sm text-muted">
          <span className="font-semibold text-text">{used}</span> of {cap} posts
        </span>
      </div>
      <ol className="grid grid-cols-1 border-l border-t border-rule sm:grid-cols-4 lg:grid-cols-7">
        {week.map(({ ymd, dow }) => {
          const postingDay = (schedule.days as readonly number[]).includes(dow);
          const list = [...(byDay.get(ymd) ?? [])].sort((a, b) => a.at.getTime() - b.at.getTime());
          const isToday = ymd === today;
          const past = ymd < today;
          return (
            <li key={ymd} className={`min-h-0 border-b border-r sm:min-h-32 border-rule p-3 ${postingDay ? "bg-paper" : ""} ${past && list.length === 0 ? "opacity-60" : ""}`}>
              <div className="flex items-baseline justify-between">
                <span className={`text-sm font-semibold ${postingDay ? "text-ink" : "text-muted"}`}>{DAY[dow]}</span>
                <span className={`text-sm tabular-nums ${isToday ? "bg-mark px-1.5 font-bold text-text" : "text-muted"}`}>
                  {Number(ymd.slice(8))}
                  {isToday ? <span className="sr-only"> (today)</span> : null}
                </span>
              </div>
              {list.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{past ? "" : postingDay ? "Open slot" : "No posting"}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {list.map((it) => (
                    <li key={`${it.kind}-${it.id}`}>
                      <Link
                        href={it.href}
                        className="block border-l-2 py-0.5 pl-2 text-sm leading-snug hover:bg-sheet"
                        style={{ borderColor: it.kind === "published" ? "var(--color-leaf)" : "var(--color-proof)" }}
                      >
                        <span className="block font-semibold tabular-nums">
                          {localDay(it.at).hm} <span className="font-normal text-muted">{it.kind === "published" ? "published" : "scheduled"}</span>
                        </span>
                        <span className="line-clamp-2 text-muted">{it.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** This week and next: which days take posts, what is placed where, and how much of the weekly cap is used. */
export function Week({ items, cap }: { items: Item[]; cap: number }) {
  return (
    <div>
      <p className="mb-5 text-sm text-muted">
        Posts go out at {schedule.times.join(" or ")} on {schedule.days.map((d) => DAY[d]).join(", ")}.
      </p>
      <WeekRow title="This week" weeksAhead={0} items={items} cap={cap} />
      <WeekRow title="Next week" weeksAhead={1} items={items} cap={cap} />
    </div>
  );
}
