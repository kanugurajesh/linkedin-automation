import { readFile } from "node:fs/promises";
import path from "node:path";

const TYPES: Record<string, string> = { ".png": "image/png", ".pdf": "application/pdf", ".mp4": "video/mp4" };

/** Serves rendered visuals from out/draft-<id>/ so the dashboard can preview them. */
export async function GET(_req: Request, ctx: RouteContext<"/api/media/[id]/[name]">) {
  const { id, name } = await ctx.params;
  const ext = path.extname(name).toLowerCase();
  if (!/^\d+$/.test(id) || !/^[A-Za-z0-9._-]+$/.test(name) || !TYPES[ext]) {
    return new Response("Not found", { status: 404 });
  }
  const base = path.resolve("out", `draft-${id}`);
  const file = path.resolve(base, name);
  if (path.dirname(file) !== base) return new Response("Not found", { status: 404 });
  try {
    return new Response(new Uint8Array(await readFile(file)), { headers: { "Content-Type": TYPES[ext], "Cache-Control": "no-store" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
