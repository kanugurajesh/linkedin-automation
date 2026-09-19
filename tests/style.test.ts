import { describe, expect, it } from "vitest";
import { lintPost, stripEmDashes } from "@/lib/ai/style";

// A clean 600+ character post: no digits, no links, no banned phrases, hook under 200 characters.
const GOOD = [
  "Most teams treat writing as the last step. The better ones treat it as the first.",
  "A draft written before the plan exists usually explains nothing. A plan written before the draft usually survives contact with a reader.",
  "That is why a short outline beats a long brainstorm. It forces a choice about what the reader should walk away with.",
  "Once the point is clear, the sentences get shorter on their own. Fewer adjectives. Fewer qualifiers. More verbs.",
  "None of this is new. It just keeps being ignored because outlining feels slower than typing, even when it saves the whole afternoon.",
  "The habit worth building is small. Before writing a paragraph, say its point out loud in one sentence. If that takes more than a breath, the paragraph is not ready yet.",
].join("\n\n");

const rules = (body: string, facts = "") => lintPost(body, facts).map((i) => i.rule);

describe("lintPost", () => {
  it("passes a clean post", () => {
    expect(GOOD.length).toBeGreaterThan(600);
    expect(lintPost(GOOD, "")).toEqual([]);
  });

  it("flags banned AI phrases, case-insensitively", () => {
    expect(rules(`${GOOD}\n\nLet's DIVE IN.`)).toContain("banned-phrase");
    expect(rules(`${GOOD}\n\nA true game-changer.`)).toContain("banned-phrase");
  });

  it("flags links in the body (they belong in the first comment)", () => {
    expect(rules(`${GOOD}\n\nRead more at https://example.com/post`)).toContain("url-in-body");
    expect(rules(`${GOOD}\n\nSee www.example.com`)).toContain("url-in-body");
  });

  it("allows one em dash but not two", () => {
    expect(rules(`${GOOD} A pause — then more.`)).not.toContain("em-dash");
    expect(rules(`${GOOD} A pause — then more — and more.`)).toContain("em-dash");
  });

  it("limits hashtags to three, and only on the last line", () => {
    expect(rules(`${GOOD}\n\n#one #two #three`)).toEqual([]);
    expect(rules(`${GOOD}\n\n#one #two #three #four`)).toContain("hashtags");
    expect(rules(`#early hashtag in the hook\n\n${GOOD}`)).toContain("hashtag-position");
  });

  it("catches the 'it's not X, it's Y' pattern, including curly apostrophes", () => {
    expect(rules(`${GOOD} It's not about speed; it's about judgment.`)).toContain("not-x-its-y");
    expect(rules(`${GOOD} It’s not about speed, it’s about judgment.`)).toContain("not-x-its-y");
  });

  it("requires every number to come from the research", () => {
    const withNumber = `${GOOD} Revenue grew 45% last quarter.`;
    expect(lintPost(withNumber, "revenue grew 45% last quarter")).toEqual([]);
    expect(lintPost(withNumber, "")).toEqual([{ rule: "unsupported-number", detail: "45%" }]);
  });

  it("ignores list counts of ten or fewer, but not 11", () => {
    expect(rules(`${GOOD} Here are 3 reasons and 10 more.`)).not.toContain("unsupported-number");
    expect(rules(`${GOOD} Here are 11 reasons.`)).toContain("unsupported-number");
  });

  it("treats 1,100 in the post as matching 1100 in the facts", () => {
    expect(rules(`${GOOD} It reached 1,100 users.`, "reached 1100 users")).not.toContain("unsupported-number");
  });

  it("flags posts that are too short or too long", () => {
    expect(rules("Too short to be a post.")).toContain("length");
    expect(rules(Array(4).fill(GOOD).join("\n\n"))).toContain("length");
  });

  it("flags a first line over 200 characters and a question hook", () => {
    expect(rules(`${"word ".repeat(45)}\n\n${GOOD}`)).toContain("hook-length");
    expect(rules(`Why do teams skip the outline?\n\n${GOOD}`)).toContain("question-hook");
  });

  it("only flags gendered pronouns the sources never used (the model guessed)", () => {
    const body = `${GOOD} He wrote the outline first.`;
    expect(rules(body, "The author wrote the outline first.")).toContain("gendered-pronoun");
    expect(rules(body, "He wrote the outline first.")).not.toContain("gendered-pronoun");
  });
});

describe("stripEmDashes", () => {
  it("replaces em and en dashes with commas", () => {
    expect(stripEmDashes("fast — but wrong")).toBe("fast, but wrong");
    expect(stripEmDashes("2020–2024")).toBe("2020, 2024");
  });

  it("leaves text without dashes alone", () => {
    expect(stripEmDashes("a-b and a - b")).toBe("a-b and a - b");
  });
});
