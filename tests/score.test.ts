import { describe, expect, it } from "vitest";
import type { Candidate } from "@/lib/trends/discover";
import { scoreCandidates } from "@/lib/trends/score";

const cand = (over: Partial<Candidate> & Pick<Candidate, "title" | "url">): Candidate => ({
  source: "news",
  pillar: "AI engineering",
  points: 0,
  ...over,
});

describe("scoreCandidates", () => {
  it("merges near-duplicate headlines from different outlets into one topic", () => {
    const out = scoreCandidates([
      cand({ title: "OpenAI launches new agent platform for developers", url: "https://a.com/1" }),
      cand({ title: "OpenAI launches agent platform developers today", url: "https://b.com/2" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].mentions).toBe(2);
    expect(out[0].signals.crossSource).toBe(0.5);
  });

  it("gives full cross-source credit at three outlets", () => {
    const out = scoreCandidates(
      ["a.com", "b.com", "c.com"].map((h, i) => cand({ title: "OpenAI launches agent platform for developers", url: `https://${h}/${i}` })),
    );
    expect(out[0].signals.crossSource).toBe(1);
  });

  it("does not merge unrelated stories", () => {
    const out = scoreCandidates([
      cand({ title: "OpenAI launches agent platform for developers", url: "https://a.com/1" }),
      cand({ title: "Startups struggle hiring senior engineers lately", url: "https://b.com/2" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("drops titles too short to write about (bare product names)", () => {
    expect(scoreCandidates([cand({ title: "AINA", url: "https://a.com/1" }), cand({ title: "Ami AI tool", url: "https://b.com/2" })])).toEqual([]);
  });

  it("drops untagged stories that do not fit any pillar, keeps tagged ones", () => {
    const off = cand({ title: "Local bakery wins award for sourdough loaf", url: "https://a.com/1", pillar: undefined });
    const on = cand({ title: "Local bakery wins award for sourdough loaf", url: "https://a.com/1" });
    expect(scoreCandidates([off])).toEqual([]);
    expect(scoreCandidates([on])).toHaveLength(1);
  });

  it("ranks higher engagement first, all else equal", () => {
    const out = scoreCandidates([
      cand({ title: "Small story about database indexing tricks", url: "https://a.com/1", points: 10, source: "hn" }),
      cand({ title: "Big story about agent framework releases", url: "https://b.com/2", points: 500, source: "hn" }),
    ]);
    expect(out.map((t) => t.url)).toEqual(["https://b.com/2", "https://a.com/1"]);
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  it("prefers fresher stories", () => {
    const out = scoreCandidates([
      cand({ title: "Older story about container security basics", url: "https://a.com/1", ageDays: 6 }),
      cand({ title: "Fresh story about serverless cold starts", url: "https://b.com/2", ageDays: 0 }),
    ]);
    expect(out[0].url).toBe("https://b.com/2");
  });

  it("returns nothing for no input", () => {
    expect(scoreCandidates([])).toEqual([]);
  });
});
