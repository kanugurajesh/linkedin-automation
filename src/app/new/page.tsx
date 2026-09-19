import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { startWrite } from "../actions";
import { PageHeader } from "../_components/ui";
import { WriteForm } from "../_components/write-form";
import { db, topics } from "@/lib/db";

export default async function NewPost({ searchParams }: PageProps<"/new">) {
  await connection();
  const params = await searchParams;
  const rows = await db.select().from(topics).where(eq(topics.status, "new")).orderBy(desc(topics.score)).limit(25);
  const wanted = Number(Array.isArray(params.topic) ? params.topic[0] : params.topic);
  const trends = rows.map((t) => ({ id: t.id, title: t.title, url: t.url, angles: t.angles ?? [] }));

  return (
    <>
      <PageHeader title="New post">
        Give the AI a topic and your opinion. It researches the web, writes drafts in the styles you pick, and can make a visual. Nothing is published until you say so.
      </PageHeader>
      <WriteForm action={startWrite} trends={trends} initialTrendId={Number.isInteger(wanted) ? wanted : undefined} />
    </>
  );
}
