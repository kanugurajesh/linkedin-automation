"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  name: string;
  toReview: number;
  scheduled: number;
  paused: boolean;
  togglePause: (form: FormData) => Promise<void>;
};

const ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/trends", label: "Trends" },
  { href: "/drafts", label: "Drafts" },
  { href: "/posts", label: "Posts" },
];

/** Left rail on wide screens, a top bar on narrow ones. Holds navigation and the publishing switch. */
export function Rail({ name, toReview, scheduled, paused, togglePause }: Props) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

  return (
    <aside className="rail bg-ink text-white md:sticky md:top-0 md:flex md:h-screen md:flex-col md:px-6 md:py-8">
      <div className="flex items-center justify-between gap-4 px-4 py-3 md:block md:p-0">
        <div>
          <p className="text-xl font-bold leading-none tracking-tight">Post desk</p>
          <p className="mt-1 hidden text-sm text-white/65 md:block">{name}</p>
        </div>
        <form action={togglePause} className="md:hidden">
          <input type="hidden" name="back" value={path} />
          <input type="hidden" name="paused" value={paused ? "false" : "true"} />
          <button className="rounded-[3px] border border-white/30 px-3 py-1.5 text-sm font-medium">{paused ? "Resume publishing" : "Pause publishing"}</button>
        </form>
      </div>

      <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 md:mt-10 md:flex-col md:overflow-visible md:p-0">
        {ITEMS.map((item) => {
          const on = active(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? "page" : undefined}
              className={`flex items-center justify-between gap-6 whitespace-nowrap rounded-[3px] px-3 py-2 text-[15px] font-medium transition-colors ${on ? "bg-white text-ink" : "text-white/80 hover:bg-white/10"}`}
            >
              {item.label}
              {item.href === "/drafts" && toReview > 0 ? (
                <span className={`text-sm font-bold ${on ? "text-ink" : "text-mark"}`} title={`${toReview} to review`}>
                  {toReview}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto hidden border-t border-white/15 pt-5 md:block">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span aria-hidden className={`inline-block size-2.5 ${paused ? "bg-mark" : "bg-[#5fd19a]"}`} />
          {paused ? "Publishing paused" : "Publishing on"}
        </p>
        <p className="mt-1 text-sm leading-snug text-white/65">
          {scheduled > 0 ? `${scheduled} scheduled. ` : "Nothing scheduled. "}
          The worker must be running to post.
        </p>
        <form action={togglePause} className="mt-3">
          <input type="hidden" name="back" value={path} />
          <input type="hidden" name="paused" value={paused ? "false" : "true"} />
          <button className="w-full rounded-[3px] border border-white/30 px-3 py-2 text-sm font-semibold transition-colors hover:bg-white/10">
            {paused ? "Resume publishing" : "Pause publishing"}
          </button>
        </form>
      </div>
    </aside>
  );
}
