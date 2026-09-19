import { eq } from "drizzle-orm";
import { proposeAngles } from "../src/lib/ai/angles";
import { tagRelevant } from "../src/lib/ai/relevance";
import { db, topics } from "../src/lib/db";
import { collectCandidates } from "../src/lib/trends/discover";
import { scoreCandidates } from "../src/lib/trends/score";

const TOP_N = 10;

async function main() {
  console.log("Collecting candidates...");
  const candidates = await collectCandidates();
  console.log(`${candidates.length} raw candidates`);

  const relevant = await tagRelevant(candidates);
  console.log(`${relevant.length} relevant to your pillars`);

  const scored = scoreCandidates(relevant).slice(0, TOP_N);
  console.log("Proposing angles...");
  const angles = await proposeAngles(scored);

  for (const [i, t] of scored.entries()) {
    const [existing] = t.url ? await db.select().from(topics).where(eq(topics.url, t.url)) : [];
    if (existing) continue; // dedupe: already seen this story
    await db.insert(topics).values({
      title: t.title,
      url: t.url,
      source: t.source,
      pillar: t.pillar,
      score: t.score,
      signals: t.signals,
      angles: angles.get(i) ?? [],
    });
    console.log(`${t.score.toFixed(2)}  ${t.title}\n      ${(angles.get(i) ?? []).join("\n      ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
