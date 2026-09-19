import { z } from "zod";
import type { ScoredTopic } from "../trends/score";
import { generate } from "./client";

const schema = z.object({
  topics: z.array(
    z.object({
      index: z.number().int().describe("index of the topic in the input list"),
      angles: z.array(z.string()).describe("exactly 3 post angles, one sentence each"),
    }),
  ),
});

/** For each top topic, propose 3 distinct LinkedIn angles (contrarian, lesson, how-to, data story). */
export async function proposeAngles(topics: ScoredTopic[]): Promise<Map<number, string[]>> {
  const list = topics.map((t, i) => `${i}. ${t.title} (${t.source}, ${t.mentions} outlets)`).join("\n");
  const out = await generate({
    schema,
    name: "angles",
    system:
      "You help a software professional pick LinkedIn post angles. For each topic give exactly 3 distinct, specific angles: e.g. a contrarian take, a lesson learned, a practical how-to, or a data story. Each angle must take a clear stance or promise a specific takeaway (e.g. \"Most teams adopting X skip Y, and that is where it breaks\"), not just name a subject like \"Exploring...\" or \"Analyzing...\". One sentence each, concrete, no hype words. Never claim or imply personal experience (no \"I learned\", \"from my experience\"): the author adds their own take later. Only reference what the topic title supports.",
    user: list,
  });
  return new Map(out.topics.map((t) => [t.index, t.angles.slice(0, 3)]));
}
