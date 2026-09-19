import { z } from "zod";
import { scrapeMarkdown, searchWeb } from "../firecrawl";
import { generate } from "./client";

export interface Fact {
  claim: string;
  sourceUrl: string;
}

const factsSchema = z.object({
  facts: z.array(
    z.object({
      claim: z.string().describe("one self-contained factual statement, including any numbers exactly as in the source"),
      sourceUrl: z.string(),
    }),
  ),
});

const MAX_CHARS_PER_SOURCE = 6000;

/**
 * Research a topic: scrape the seed URL (if any) plus top web results,
 * then extract a list of sourced facts. The writer may only use these.
 */
export async function research(topic: string, seedUrl?: string | null): Promise<Fact[]> {
  const urls = new Set<string>();
  if (seedUrl) urls.add(seedUrl);
  for (const hit of await searchWeb(topic, 6)) {
    if (urls.size >= 4) break;
    urls.add(hit.url);
  }

  const pages = (
    await Promise.allSettled([...urls].map(async (url) => ({ url, ...(await scrapeMarkdown(url)) })))
  ).flatMap((r) => {
    if (r.status === "rejected") {
      console.warn("scrape failed:", r.reason?.message ?? r.reason);
      return [];
    }
    return r.value.markdown.length > 300 ? [r.value] : [];
  });
  if (pages.length === 0) throw new Error("Research found no readable sources for this topic");

  const sources = pages
    .map((p) => `SOURCE: ${p.url}\n${p.markdown.slice(0, MAX_CHARS_PER_SOURCE)}`)
    .join("\n\n=====\n\n");

  const out = await generate({
    schema: factsSchema,
    name: "facts",
    system:
      "Extract 8-15 concrete, verifiable facts from the sources that are relevant to the topic: numbers, dates, names, direct findings, notable quotes. Copy numbers exactly. Do not infer, generalize or add outside knowledge. Each fact must cite the SOURCE url it came from.",
    user: `Topic: ${topic}\n\n${sources}`,
  });

  const known = new Set(pages.map((p) => p.url));
  return out.facts.filter((f) => known.has(f.sourceUrl));
}
