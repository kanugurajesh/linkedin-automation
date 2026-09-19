import Link from "next/link";
import { connection } from "next/server";
import { Week } from "./_components/week";
import { Empty, Flash, PageHeader, SectionTitle, StatusMark } from "./_components/ui";
import { checkAuth } from "@/lib/linkedin/client";
import { getEnv } from "@/lib/env";
import { activeJobs } from "@/lib/jobs";
import { listDrafts, listPosts } from "@/lib/queue-core";

async function authStatus() {
  if (process.env.DEMO_MODE === "1") return { ok: false, text: "Demo: LinkedIn is not connected, so nothing can be published." };
  try {
    const a = await checkAuth();
    return a.urnMatches
      ? { ok: true, text: `Connected as ${a.name}. The token comes from ${a.source === "env" ? ".env.local" : "the login flow"}.` }
      : { ok: false, text: `Connected as ${a.name}, but LINKEDIN_PERSON_URN does not match this token. Posts would go to the wrong account: fix the URN in .env.local.` };
  } catch (e) {
    return { ok: false, text: `LinkedIn rejected the token (${e instanceof Error ? e.message.slice(0, 120) : "unknown error"}). Run npm run linkedin:auth to sign in again.` };
  }
}

export default async function Overview({ searchParams }: PageProps<"/">) {
  await connection();
  const [params, drafts, posts, auth, running] = await Promise.all([searchParams, listDrafts(), listPosts(), authStatus(), activeJobs()]);
  const { MAX_POSTS_PER_WEEK } = getEnv("MAX_POSTS_PER_WEEK");

  const attention = drafts.filter((d) => d.status === "draft" || d.status === "failed");
  const items = [
    ...drafts.flatMap((d) =>
      d.status === "scheduled" && d.scheduledAt ? [{ id: d.id, kind: "scheduled" as const, at: d.scheduledAt, label: d.hook, href: `/drafts/${d.id}` }] : [],
    ),
    ...posts.map((p) => ({ id: p.id, kind: "published" as const, at: p.publishedAt, label: p.hook, href: "/posts" })),
  ];

  return (
    <>
      <PageHeader title="This week">
        {attention.length > 0
          ? `${attention.length} ${attention.length === 1 ? "draft is" : "drafts are"} waiting for a decision.`
          : "Nothing is waiting on you. Find a topic on the Trends page, then write a draft from the terminal."}
      </PageHeader>
      <Flash params={params} />
      {running.map((j) => (
        <p key={j.id} className="mb-8 border-l-4 border-proof bg-paper px-4 py-3 text-[15px]">
          {{ write: "Drafts are being written", visual: "A visual is being created", publish: "A post is being published" }[j.kind] ?? "A job is running"}: {j.step ?? "working"}.{" "}
          <Link href={`/jobs/${j.id}`} className="font-semibold text-ink underline underline-offset-4">
            See progress
          </Link>
        </p>
      ))}

      <section className="mb-12">
        <SectionTitle>Publishing calendar</SectionTitle>
        <Week items={items} cap={MAX_POSTS_PER_WEEK} />
      </section>

      <section className="mb-12">
        <SectionTitle aside={attention.length > 0 ? <Link href="/drafts" className="font-semibold text-ink underline underline-offset-4">See all drafts</Link> : null}>
          Needs your attention
        </SectionTitle>
        {attention.length === 0 ? (
          <Empty title="You are caught up.">New drafts land here. Failed posts show up here too, with the reason.</Empty>
        ) : (
          <ul className="border-t border-rule">
            {attention.slice(0, 6).map((d) => (
              <li key={d.id} className="border-b border-rule">
                <Link href={`/drafts/${d.id}`} className="grid gap-x-6 gap-y-1 py-4 hover:bg-paper md:grid-cols-[9rem_1fr] md:items-baseline">
                  <StatusMark status={d.status} />
                  <span>
                    <span className="line-clamp-2 font-medium leading-snug">{d.hook}</span>
                    {d.error ? <span className="mt-1 block text-sm text-pencil">{d.error.slice(0, 160)}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>LinkedIn connection</SectionTitle>
        <p className={`flex max-w-2xl items-start gap-3 text-[15px] leading-relaxed ${auth.ok ? "text-text" : "text-pencil"}`}>
          <span aria-hidden className={`mt-1.5 inline-block size-2.5 shrink-0 ${auth.ok ? "bg-leaf" : "bg-pencil"}`} />
          {auth.text}
        </p>
      </section>
    </>
  );
}
