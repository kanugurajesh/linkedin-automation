type Params = Record<string, string | string[] | undefined>;

export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Result of the last action, passed back through ?ok= or ?err=. Errors say what happened and what to do. */
export function Flash({ params }: { params: Params }) {
  const ok = first(params.ok);
  const err = first(params.err);
  if (!ok && !err) return null;
  return (
    <div
      role={err ? "alert" : "status"}
      className={`mb-8 border-l-4 bg-paper px-4 py-3 text-sm ${err ? "border-pencil text-pencil" : "border-leaf text-text"}`}
    >
      {err ?? ok}
    </div>
  );
}

const STATUS: Record<string, { label: string; box: string }> = {
  draft: { label: "Needs review", box: "border border-muted bg-transparent" },
  scheduled: { label: "Scheduled", box: "bg-proof" },
  publishing: { label: "Publishing", box: "bg-mark" },
  published: { label: "Published", box: "bg-leaf" },
  failed: { label: "Failed", box: "bg-pencil" },
  rejected: { label: "Rejected", box: "bg-rule" },
};

export const statusLabel = (s: string) => STATUS[s]?.label ?? s;

/** Square marker plus plain-language status. Colour is never the only signal. */
export function StatusMark({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.draft;
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium">
      <span aria-hidden className={`inline-block size-2.5 ${s.box}`} />
      {s.label}
    </span>
  );
}

export function PageHeader({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-8 max-w-2xl">
      <h1 className="text-3xl font-bold leading-tight tracking-tight text-ink md:text-4xl">{title}</h1>
      {children ? <p className="mt-2 text-base leading-relaxed text-muted">{children}</p> : null}
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-lg font-semibold tracking-tight text-ink">{children}</h2>
      {aside ? <div className="text-sm text-muted">{aside}</div> : null}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-dashed border-rule px-6 py-10">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

export const btnPrimary =
  "inline-flex items-center justify-center rounded-[3px] bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink-soft disabled:opacity-50";
export const btnQuiet =
  "inline-flex items-center justify-center rounded-[3px] border border-rule bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink";
export const btnWarn =
  "inline-flex items-center justify-center rounded-[3px] bg-pencil px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#8f2d20]";
export const btnDanger =
  "inline-flex items-center py-2 text-sm font-semibold text-pencil underline underline-offset-4 hover:no-underline";
export const field = "rounded-[3px] border border-rule bg-paper px-3 py-2 text-sm text-text placeholder:text-muted";
