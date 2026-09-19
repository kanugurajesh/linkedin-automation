import { z } from "zod";
import { pillars } from "../../../config/niche";
import type { Candidate } from "../trends/discover";
import { generate } from "./client";

const schema = z.object({
  items: z.array(
    z.object({
      index: z.number().int(),
      pillar: z.string().nullable().describe("best matching pillar name, or null if none fits"),
    }),
  ),
});

/**
 * Listing pages (HN, Product Hunt) are unfiltered, so ask the model which items
 * belong to one of the user's pillars. Items already tagged by a keyword search pass through.
 */
export async function tagRelevant(cands: Candidate[]): Promise<Candidate[]> {
  const untagged = cands.map((c, i) => ({ c, i })).filter(({ c }) => !c.pillar);
  if (untagged.length === 0) return cands;

  const out = await generate({
    schema,
    name: "relevance",
    system: `Assign each headline to one of these LinkedIn content pillars, or null if it clearly fits none. Be strict: only tag items a professional in this niche would plausibly post about.\nPillars:\n${pillars.map((p) => `- ${p.name} (${p.keywords.join(", ")})`).join("\n")}`,
    user: untagged.map(({ c }, n) => `${n}. ${c.title}`).join("\n"),
  });

  const valid = new Set(pillars.map((p) => p.name));
  const tagged = new Map<number, string>();
  for (const it of out.items) {
    const src = untagged[it.index];
    if (src && it.pillar && valid.has(it.pillar)) tagged.set(src.i, it.pillar);
  }
  return cands.flatMap((c, i) => (c.pillar ? [c] : tagged.has(i) ? [{ ...c, pillar: tagged.get(i) }] : []));
}
