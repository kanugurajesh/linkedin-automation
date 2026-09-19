import Firecrawl from "@mendable/firecrawl-js";
import { eq } from "drizzle-orm";
import { z, type ZodType } from "zod";
import { db, scrapeCache } from "./db";
import { getEnv } from "./env";

let client: Firecrawl | undefined;
function fc() {
  client ??= new Firecrawl({ apiKey: getEnv("FIRECRAWL_API_KEY").FIRECRAWL_API_KEY });
  return client;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // repeated runs must not burn credits

/** Serialize-ish calls (max 2 in flight) and retry when Firecrawl reports a per-minute rate limit. */
let inFlight = 0;
const waiters: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  while (inFlight >= 2) await new Promise<void>((r) => waiters.push(r));
  inFlight++;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/rate limit/i.test(msg) || attempt >= 3) throw e;
        await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
      }
    }
  } finally {
    inFlight--;
    waiters.shift()?.();
  }
}

export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
  date?: string;
}

/** News search restricted to the last `days` days. */
export async function searchNews(query: string, days: number, limit = 8): Promise<SearchHit[]> {
  const tbs = days <= 1 ? "qdr:d" : days <= 7 ? "qdr:w" : "qdr:m";
  const res = await limited(() => fc().search(query, { sources: ["news"], tbs, limit }));
  return (res.news ?? []).flatMap((n) =>
    "url" in n && n.url
      ? [
          {
            url: n.url,
            title: ("title" in n && n.title) || n.url,
            snippet: ("snippet" in n && n.snippet) || "",
            date: "date" in n ? n.date : undefined,
          },
        ]
      : [],
  );
}

/** Web search (used for research on a chosen topic). */
export async function searchWeb(query: string, limit = 6): Promise<SearchHit[]> {
  const res = await limited(() => fc().search(query, { sources: ["web"], limit }));
  return (res.web ?? []).flatMap((w) =>
    "url" in w && w.url
      ? [{ url: w.url, title: ("title" in w && w.title) || w.url, snippet: ("description" in w && w.description) || "" }]
      : [],
  );
}

/** Scrape a page to markdown, cached in SQLite. */
export async function scrapeMarkdown(url: string): Promise<{ markdown: string; title?: string }> {
  const [hit] = await db.select().from(scrapeCache).where(eq(scrapeCache.url, url));
  if (hit && Date.now() - hit.fetchedAt.getTime() < CACHE_TTL_MS) {
    return { markdown: hit.markdown, title: hit.title ?? undefined };
  }
  const doc = await limited(() => fc().scrape(url, { formats: ["markdown"], onlyMainContent: true }));
  const markdown = doc.markdown ?? "";
  const title = doc.metadata?.title;
  await db
    .insert(scrapeCache)
    .values({ url, markdown, title, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: scrapeCache.url, set: { markdown, title, fetchedAt: new Date() } });
  return { markdown, title };
}

/** Scrape a page and extract structured data with a zod schema. */
export async function scrapeJson<T>(url: string, schema: ZodType<T>, prompt: string): Promise<T> {
  const doc = await limited(() =>
    fc().scrape(url, {
      // The SDK does not convert zod v4 schemas, so pass plain JSON schema.
      formats: [{ type: "json", schema: z.toJSONSchema(schema) as Record<string, unknown>, prompt }],
    }),
  );
  return schema.parse(doc.json);
}
