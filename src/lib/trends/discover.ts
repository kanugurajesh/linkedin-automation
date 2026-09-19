import { z } from "zod";
import { freshnessDays, listingSources, pillars } from "../../../config/niche";
import { scrapeJson, searchNews } from "../firecrawl";

export interface Candidate {
  title: string;
  url: string;
  source: string;
  pillar?: string;
  points: number; // engagement signal from listing pages (0 if unknown)
  ageDays?: number;
}

const listingSchema = z.object({
  items: z.array(
    z.object({
      title: z.string(),
      url: z.string().optional(),
      points: z.number().optional().describe("points, upvotes or vote count"),
    }),
  ),
});

function ageInDays(date?: string): number | undefined {
  if (!date) return undefined;
  const t = Date.parse(date);
  if (!Number.isNaN(t)) return Math.max(0, (Date.now() - t) / 86_400_000);
  const rel = /(\d+)\s+(minute|hour|day|week)/i.exec(date);
  if (!rel) return undefined;
  const n = Number(rel[1]);
  const unit = rel[2].toLowerCase();
  return unit === "minute" ? n / 1440 : unit === "hour" ? n / 24 : unit === "day" ? n : n * 7;
}

/** Pull raw candidates from news searches per pillar keyword and from listing pages. */
export async function collectCandidates(): Promise<Candidate[]> {
  const out: Candidate[] = [];

  const searches = pillars.flatMap((p) => p.keywords.map((k) => ({ pillar: p.name, keyword: k })));
  const results = await Promise.allSettled(
    searches.map(async ({ pillar, keyword }) => {
      const hits = await searchNews(keyword, freshnessDays);
      return hits.map<Candidate>((h) => ({
        title: h.title,
        url: h.url,
        source: "news",
        pillar,
        points: 0,
        ageDays: ageInDays(h.date),
      }));
    }),
  );
  for (const r of results) {
    if (r.status === "fulfilled") out.push(...r.value);
    else console.warn("news search failed:", r.reason?.message ?? r.reason);
  }

  const listings = await Promise.allSettled(
    listingSources.map(async ({ source, url }) => {
      const data = await scrapeJson(
        url,
        listingSchema,
        "Extract the top stories/products listed on this page with their title, link and points/upvotes.",
      );
      return data.items
        .filter((i) => i.url)
        .map<Candidate>((i) => ({ title: i.title, url: i.url!, source, points: i.points ?? 0 }));
    }),
  );
  for (const r of listings) {
    if (r.status === "fulfilled") out.push(...r.value);
    else console.warn("listing scrape failed:", r.reason?.message ?? r.reason);
  }

  return out;
}
