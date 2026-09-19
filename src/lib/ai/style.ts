import { existsSync, readFileSync } from "node:fs";

/** Phrases that make a post read as machine-written. Checked deterministically after generation. */
export const BANNED_PHRASES = [
  "delve",
  "in today's fast-paced world",
  "in today's digital landscape",
  "game-changer",
  "game changer",
  "let's dive in",
  "dive into",
  "unlock the power",
  "unleash",
  "revolutionize",
  "harness the power",
  "navigate the landscape",
  "ever-evolving",
  "at the end of the day",
  "it's important to note",
  "in conclusion",
  "buckle up",
  "here's the kicker",
  "pivotal",
  "tapestry",
  "testament to",
];

export const HUMAN_RULES = `
- Write like a person talking to a colleague: plain words, contractions, first person where an opinion is stated.
- Vary sentence length. Mix short punchy lines with a longer one. Fragments are fine.
- One idea per post. Cut anything that doesn't serve it.
- Be specific: a real number, name or example beats a general claim. Use only facts you were given.
- No "It's not X, it's Y" constructions. No rhetorical question openers. No "Here's the thing".
- Avoid em dashes; use a period or comma instead.
- No corporate filler, no hype words, no lists of three adjectives.
- Short paragraphs (1-2 lines), blank line between them.
- At most one emoji, and only if it fits the voice. At most 3 hashtags, at the very end. Zero is fine.
- First person ("I", "my") may ONLY express the author's own take. Anything a source's author did, built, tried or found must be attributed to them ("the author", "the piece", a name), never phrased as the post author's own experience. Never write "I built/developed/tried/discovered/realized/found/use/treat", "in my experience" or "I've seen" unless the author's take says so. Refer to a source's author by name or as "the author"; never guess their gender.
- Never put URLs in the post body. Sources go in the first comment.
- End with a specific question or a plain closing line, not a generic "What do you think?".
`.trim();

export const DEFAULT_VOICE = `
Direct, practical, a bit dry. Speaks as an engineer sharing what they noticed, not a guru.
Short sentences. Admits uncertainty. Opinions stated plainly and backed by one concrete detail.
`.trim();

/** Your own posts, if you added them. Used as few-shot examples for tone. */
export function loadVoice(): { description: string; samples: string | null } {
  const file = "voice/samples.md";
  const samples = existsSync(file) ? readFileSync(file, "utf8").trim() : "";
  return { description: DEFAULT_VOICE, samples: samples || null };
}

/** Models keep using em dashes despite instructions, so remove them deterministically. */
export function stripEmDashes(text: string): string {
  return text.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, ", ");
}

export interface LintIssue {
  rule: string;
  detail: string;
}

/** Deterministic checks the model can't be trusted to self-report. */
export function lintPost(body: string, factsCorpus: string): LintIssue[] {
  const issues: LintIssue[] = [];
  body = body.replace(/[‘’]/g, "'").replace(/[“”]/g, '"'); // models emit curly quotes
  const lower = body.toLowerCase();

  for (const p of BANNED_PHRASES) {
    if (lower.includes(p)) issues.push({ rule: "banned-phrase", detail: p });
  }
  if (/https?:\/\/|www\./i.test(body)) issues.push({ rule: "url-in-body", detail: "move links to first comment" });
  const dashes = (body.match(/—/g) ?? []).length;
  if (dashes > 1) issues.push({ rule: "em-dash", detail: `${dashes} em dashes` });
  const hashtags = (body.match(/(^|\s)#\w+/g) ?? []).length;
  if (hashtags > 3) issues.push({ rule: "hashtags", detail: `${hashtags} hashtags, max 3` });
  const lines = body.trim().split("\n");
  if (lines.slice(0, -1).some((l) => /(^|\s)#\w+/.test(l))) {
    issues.push({ rule: "hashtag-position", detail: "hashtags belong only on the last line" });
  }
  // Only flag pronouns the sources never used, i.e. the model guessed.
  if (/\b(he|she|his|him|her)\b/i.test(body) && !/\b(he|she|his|him|her)\b/i.test(factsCorpus)) {
    issues.push({ rule: "gendered-pronoun", detail: "do not guess gender for the source's author; use their name or 'the author'" });
  }
  if (/\bit'?s not [^.,;]{1,40}[,;]? it'?s\b/i.test(body)) issues.push({ rule: "not-x-its-y", detail: "contrast pattern" });

  const len = body.length;
  if (len < 600) issues.push({ rule: "length", detail: `${len} chars, aim for 1000-1600` });
  if (len > 2200) issues.push({ rule: "length", detail: `${len} chars, aim for 1000-1600` });

  const hook = body.split("\n")[0] ?? "";
  if (hook.trim().endsWith("?")) issues.push({ rule: "question-hook", detail: "open with a statement, not a question" });
  if (hook.length > 200) issues.push({ rule: "hook-length", detail: `first line is ${hook.length} chars, max 200` });

  // Numbers must come from the research. Ignore small integers (list counts like "3 lessons").
  const corpus = factsCorpus.replace(/,/g, "");
  for (const m of body.replace(/,/g, "").matchAll(/\d+(?:\.\d+)?%?/g)) {
    const n = m[0];
    if (/^\d$|^10$/.test(n)) continue;
    if (!corpus.includes(n.replace("%", ""))) issues.push({ rule: "unsupported-number", detail: n });
  }
  return issues;
}
