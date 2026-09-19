import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, drafts } from "../db";
import { generate } from "./client";
import type { Fact } from "./research";
import { HUMAN_RULES, lintPost, loadVoice, stripEmDashes, type LintIssue } from "./style";

export interface WriteInput {
  topicId?: number | null;
  topic: string;
  angle?: string;
  personalTake: string; // required: the one thing that makes the post yours
  facts: Fact[];
  variants?: number;
}

const FORMAT_HINTS: Record<string, string> = {
  contrarian: "Open with a claim most people in the field would push back on, then back it with the facts.",
  story: "Tell it as a short sequence of events from the facts, told about the source or the people in it. Do not invent scenes or personal history for the author beyond their take.",
  listicle: "A numbered list (1., 2., 3.) of 3-5 concrete points, each one line plus a specific detail. Keep the numbering.",
  analysis: "Lead with the single most surprising number or finding, then explain what it means.",
  howto: "Give a practical sequence of steps someone could follow today, grounded in the facts.",
};

function context(input: WriteInput) {
  const { description, samples } = loadVoice();
  const facts = input.facts.map((f, i) => `${i + 1}. ${f.claim} [${f.sourceUrl}]`).join("\n");
  const voice = `VOICE:\n${description}${samples ? `\n\nThe author's real posts (match tone and rhythm, do not copy content):\n${samples}` : ""}`;
  return { facts, voice, corpus: input.facts.map((f) => f.claim).join("\n") };
}

const draftSchema = z.object({
  variants: z.array(z.object({ format: z.string(), body: z.string() })),
});

async function draftVariants(input: WriteInput, n: number) {
  const { facts, voice } = context(input);
  const formats = Object.keys(FORMAT_HINTS).slice(0, n);
  const out = await generate({
    schema: draftSchema,
    name: "drafts",
    system: `You ghostwrite LinkedIn posts. Write ${n} distinct drafts, one per requested format, in this order: ${formats.join(", ")}.
The first line of each is the hook: one standalone line under 200 characters. Body length 1000-1600 characters.
Use ONLY the facts provided. Do not add statistics, names or claims from memory. The author's take is the spine of the post.
Format guidance:
${formats.map((f) => `- ${f}: ${FORMAT_HINTS[f]}`).join("\n")}
Style rules:
${HUMAN_RULES}
${voice}`,
    user: `Topic: ${input.topic}${input.angle ? `\nAngle: ${input.angle}` : ""}\nAuthor's take: ${input.personalTake}\n\nFACTS:\n${facts}`,
  });
  return out.variants.slice(0, n).map((v, i) => ({ format: formats[i] ?? v.format, body: v.body.trim() }));
}

const bodySchema = z.object({ body: z.string() });

/** Rewrite pass: keep meaning and facts, strip AI tells, tighten rhythm. */
async function humanize(input: WriteInput, body: string): Promise<string> {
  const { voice } = context(input);
  const out = await generate({
    schema: bodySchema,
    name: "humanized",
    system: `You are an editor. Rewrite the LinkedIn post so it reads as written by a real person. Keep every fact and the author's opinion. Add no new facts. Keep the first line as a standalone hook.
${HUMAN_RULES}
${voice}`,
    user: body,
  });
  return out.body.trim();
}

const hookSchema = z.object({
  hooks: z.array(z.string()).describe("exactly 5 alternative first lines"),
  bestIndex: z.number().int().describe("index of the strongest hook"),
});

/** Generate 5 hooks, keep the strongest. Only the first line changes. */
async function optimizeHook(input: WriteInput, body: string): Promise<string> {
  const [first, ...rest] = body.split("\n");
  const out = await generate({
    schema: hookSchema,
    name: "hooks",
    system: `Write 5 alternative opening lines for this LinkedIn post, each under 180 characters. They must make a reader click "see more" (specific, curious, concrete) without clickbait or false claims, and must be supported by the post's content. Include the current line as a candidate if it's already strongest. Pick the best. ${HUMAN_RULES}`,
    user: `Current hook: ${first}\n\nPost:\n${body}\n\nAuthor's take: ${input.personalTake}`,
  });
  const best = out.hooks[out.bestIndex]?.trim();
  return best && best.length <= 200 ? [best, ...rest].join("\n") : body;
}

/** Fix any lint issues (banned phrases, unsupported numbers, length). */
async function fixIssues(input: WriteInput, body: string, issues: LintIssue[]): Promise<string> {
  const { facts } = context(input);
  const out = await generate({
    schema: bodySchema,
    name: "fixed",
    system: `Fix these problems in the LinkedIn post and change nothing else. Only numbers present in FACTS may appear; remove or rephrase any that aren't. Keep the hook on the first line. For "possible-invented-experience": if the action comes from FACTS, attribute it to the source (e.g. "the author"), and only keep first person for the author's own take: "${input.personalTake}".\nStyle rules to respect:\n${HUMAN_RULES}\nProblems:\n${issues.map((i) => `- ${i.rule}: ${i.detail}`).join("\n")}\n\nFACTS:\n${facts}`,
    user: body,
  });
  return out.body.trim();
}

const auditSchema = z.object({
  invented: z.array(z.number().int()).describe("indexes of sentences that claim experience not in the author's take"),
});

const FIRST_PERSON = /\b(I|I'm|I've|I'd|I'll|my|me|we|our|us)\b/;

/**
 * Regex can't tell whether a first-person statement is really the author's.
 * Only first-person sentences are sent to the model (none, no call), and only
 * to check them against the author's take. Third-person attribution is not audited here.
 */
async function audit(input: WriteInput, body: string): Promise<LintIssue[]> {
  const sentences = body
    .replace(/[‘’]/g, "'")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => FIRST_PERSON.test(s));
  if (sentences.length === 0) return [];

  const out = await generate({
    schema: auditSchema,
    name: "audit",
    system: `The author will publish these first-person sentences under their own name. Return the indexes of sentences that state an experience, habit, observation or belief that the author's take does NOT contain or directly imply (e.g. "in my experience...", "I've seen...", "I use X"). Sentences that restate or elaborate the take are fine. Return an empty list if all are fine.

AUTHOR'S TAKE: ${input.personalTake}`,
    user: sentences.map((s, i) => `${i}. ${s}`).join("\n"),
  });
  return out.invented.flatMap((i) => (sentences[i] ? [{ rule: "invented-experience", detail: sentences[i] }] : []));
}

export interface WrittenDraft {
  id: number;
  format: string;
  body: string;
  remainingIssues: LintIssue[];
}

/** Full pipeline: draft variants -> humanize -> hook -> lint/fix -> save to the drafts table. */
export async function writePosts(input: WriteInput): Promise<WrittenDraft[]> {
  const n = input.variants ?? 3;
  const { corpus } = context(input);
  const batchId = randomUUID();

  const raw = await draftVariants(input, n);
  const firstComment = `Sources:\n${[...new Set(input.facts.map((f) => f.sourceUrl))].slice(0, 4).join("\n")}`;

  return Promise.all(
    raw.map(async (v) => {
      let body = stripEmDashes(await optimizeHook(input, await humanize(input, v.body)));
      const check = async (b: string) => [...lintPost(b, corpus), ...(await audit(input, b))];
      let issues = await check(body);
      for (let round = 0; round < 2 && issues.length > 0; round++) {
        body = stripEmDashes(await fixIssues(input, body, issues));
        issues = await check(body);
      }
      const [row] = await db
        .insert(drafts)
        .values({
          topicId: input.topicId ?? null,
          batchId,
          format: v.format,
          hook: body.split("\n")[0] ?? "",
          body,
          firstComment,
          personalTake: input.personalTake,
          facts: input.facts,
        })
        .returning({ id: drafts.id });
      return { id: row.id, format: v.format, body, remainingIssues: issues };
    }),
  );
}
