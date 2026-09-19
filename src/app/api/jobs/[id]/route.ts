import { getJob } from "@/lib/jobs";
import { toView } from "@/lib/jobs-view";

/** Polled by the job progress page. */
export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const job = await getJob(Number(id));
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(toView(job), { headers: { "Cache-Control": "no-store" } });
}
