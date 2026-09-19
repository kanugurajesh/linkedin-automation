import { spawn } from "node:child_process";
import path from "node:path";

/**
 * Runs `scripts/queue.ts <args>` in a child process. The dashboard uses this for steps that render
 * with Remotion or call the LLM (approve, plan a visual): Next can't bundle Remotion, and this
 * reuses the exact code path the CLI already exercises. Args go straight to the process (no shell),
 * and callers pass only validated ids/enums.
 */
export function runQueue(args: string[], timeoutMs = 10 * 60_000): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.resolve("node_modules/tsx/dist/cli.mjs"), "--env-file=.env.local", "scripts/queue.ts", ...args],
      { cwd: process.cwd(), windowsHide: true },
    );
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, output: String(e) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: output.trim() });
    });
  });
}
