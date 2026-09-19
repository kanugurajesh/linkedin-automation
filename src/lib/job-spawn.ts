import { spawn } from "node:child_process";
import path from "node:path";
import { failJob } from "./jobs";

/**
 * Starts scripts/job.ts for a job in a detached process and returns immediately. The dashboard can then
 * show progress from the jobs table, and closing the browser or restarting the web server does not
 * stop the work. Only the numeric job id is passed on the command line (no shell involved).
 */
export function spawnJob(jobId: number) {
  const child = spawn(
    process.execPath,
    [path.resolve("node_modules/tsx/dist/cli.mjs"), "--env-file=.env.local", "scripts/job.ts", String(jobId)],
    { cwd: process.cwd(), detached: true, stdio: "ignore", windowsHide: true },
  );
  child.on("error", (e) => void failJob(jobId, `Could not start the background process: ${e.message}`));
  child.unref();
}
