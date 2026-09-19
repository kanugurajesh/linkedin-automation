import type { Job } from "./jobs";

/** What the browser is allowed to see of a job: no raw params, just what the progress page needs. */
export type JobView = {
  id: number;
  kind: string;
  status: string;
  step: string | null;
  log: string[];
  result: Record<string, unknown> | null;
  error: string | null;
  draftId: number | null;
  createdAt: number;
};

export function toView(job: Job): JobView {
  const draftId = typeof job.params.draftId === "number" ? job.params.draftId : null;
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    step: job.step,
    log: job.log,
    result: job.result,
    error: job.error,
    draftId,
    createdAt: job.createdAt.getTime(),
  };
}
