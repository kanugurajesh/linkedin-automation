import { z } from "zod";
import type { MediaSpec } from "../../../remotion/types";
import { generate } from "./client";
import type { Fact } from "./research";

export type MediaKind = "carousel" | "image" | "video" | "none";

// Flat schema: OpenAI strict structured outputs handle this more reliably than unions.
const schema = z.object({
  kind: z.enum(["carousel", "image", "video", "none"]),
  slides: z.array(z.object({ heading: z.string(), body: z.string() })).describe("carousel only, else empty"),
  quote: z.string().describe("image only, else empty string"),
  attribution: z.string().describe("image only, else empty string"),
  statValue: z.string().describe("video only: the headline number, e.g. 73% or $4.2B, else empty string"),
  statLabel: z.string().describe("video only: what the number means, else empty string"),
  bullets: z.array(z.string()).describe("video only: 2-4 short points, else empty"),
});

const GUIDE = `Pick the visual that suits the post:
- carousel: the post is steps, a list, or a multi-part argument. 5-8 slides. Slide 1 is the cover (the hook, max 9 words). Last slide is a takeaway (max 12 words). Headings max 8 words, body max 25 words, body may be empty.
- video: one striking number carries the post. Provide the number, a label, and 2-4 bullets of max 12 words.
- image: one strong quotable line. Max 20 words.
- none: nothing visual would add value.`;

/** Turn a finished post into a visual plan. All text must come from the post or facts. */
export async function planMedia(body: string, facts: Fact[], force?: MediaKind): Promise<MediaSpec | null> {
  const out = await generate({
    schema,
    name: "media_plan",
    system: `You design the visual for a LinkedIn post. Reuse the post's own wording; do not add claims or numbers that are not in the post or FACTS. No emojis. ${GUIDE}${force ? `\nYou MUST use kind="${force}".` : ""}
Unused fields must be empty ("" or []).

FACTS:
${facts.map((f) => `- ${f.claim}`).join("\n")}`,
    user: body,
  });

  if (out.kind === "carousel" && out.slides.length >= 3) {
    return { kind: "carousel", slides: out.slides.slice(0, 10).map((s) => ({ heading: s.heading.trim(), body: s.body.trim() || undefined })) };
  }
  if (out.kind === "image" && out.quote.trim()) {
    return { kind: "image", quote: out.quote.trim(), attribution: out.attribution.trim() || undefined };
  }
  if (out.kind === "video" && out.statValue.trim() && out.bullets.length >= 2) {
    return { kind: "video", stat: { value: out.statValue.trim(), label: out.statLabel.trim() }, bullets: out.bullets.slice(0, 4) };
  }
  return null; // "none", or the model picked a kind without filling it in
}
