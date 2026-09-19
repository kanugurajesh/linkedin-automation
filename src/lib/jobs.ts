import { and, desc, eq } from "drizzle-orm";
import { db, jobs } from "./db";

export type JobKind = "write" | "visual" | "publish";
export type Job = typeof jobs.$inferSelect;

/** A running job that has not reported progress for this long is treated as dead (crashed or killed). */
const STALE_MS = 20 * 60_000;

export async function createJob(kind: JobKind, params: Record<string, unknown>): Promise<number> {
  const [row] = await db.insert(jobs).values({ kind, params, step: "Starting" }).returning({ id: jobs.id });
  return row.id;
}

/** The newest still-alive job of a kind, so two of the same kind never run at once. */
export async function runningJob(kind: JobKind): Promise<Job | undefined> {
  const rows = await db.select().from(jobs).where(and(eq(jobs.kind, kind), eq(jobs.status, "running"))).orderBy(desc(jobs.id));
  return rows.find((j) => Date.now() - j.updatedAt.getTime() < STALE_MS);
}

/** Every job still alive, for the "something is running" notice. */
export async function activeJobs(): Promise<Job[]> {
  const rows = await db.select().from(jobs).where(eq(jobs.status, "running")).orderBy(desc(jobs.id));
  return rows.filter((j) => Date.now() - j.updatedAt.getTime() < STALE_MS);
}

/** Marks the current step done and starts the next. Also serves as the job's heartbeat. */
export async function progress(id: number, step: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) return;
  const log = job.step && job.step !== step ? [...job.log, job.step] : job.log;
  await db.update(jobs).set({ step, log, updatedAt: new Date() }).where(eq(jobs.id, id));
}

export async function finishJob(id: number, result: Record<string, unknown>) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  const log = job?.step ? [...job.log, job.step] : (job?.log ?? []);
  await db.update(jobs).set({ status: "done", step: null, log, result, updatedAt: new Date() }).where(eq(jobs.id, id));
}

export async function failJob(id: number, error: string) {
  await db.update(jobs).set({ status: "failed", error: error.slice(0, 1000), updatedAt: new Date() }).where(eq(jobs.id, id));
}

/** Reads a job, first failing it if it stopped reporting (so the page never spins forever). */
export async function getJob(id: number): Promise<Job | undefined> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (job && job.status === "running" && Date.now() - job.updatedAt.getTime() > STALE_MS) {
    await failJob(id, "This job stopped reporting progress and was probably interrupted. Nothing was lost; start it again.");
    return (await db.select().from(jobs).where(eq(jobs.id, id)))[0];
  }
  return job;
}
