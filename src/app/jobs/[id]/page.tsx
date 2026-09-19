import { notFound } from "next/navigation";
import { connection } from "next/server";
import { JobProgress } from "../../_components/job-progress";
import { getJob } from "@/lib/jobs";
import { toView } from "@/lib/jobs-view";

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  await connection();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const job = await getJob(Number(id));
  if (!job) notFound();
  return <JobProgress initial={toView(job)} />;
}
