import { describe, expect, it } from "vitest";
import { evaluatePublish, isBlocked, needsConfirmation, type RuleDraft, type RuleInput } from "@/lib/publish-rules";

// Test setup uses TIMEZONE=Asia/Kolkata. Usual slots: Tue/Wed/Thu 09:00 or 12:30; 20 hours between posts.
const at = (s: string) => new Date(s);
const NOW = at("2026-09-22T05:00:00Z"); // Tuesday 10:30 IST: a posting day, inside posting hours

const draft = (over: Partial<RuleDraft> = {}): RuleDraft => ({
  id: 1,
  status: "draft",
  body: "A short post.",
  mediaSpec: null,
  mediaKind: null,
  scheduledAt: null,
  firstComment: null,
  ...over,
});

const run = (over: Partial<RuleInput> = {}) =>
  evaluatePublish({ draft: draft(), published: [], scheduled: [], paused: false, now: NOW, cap: 4, mediaRendered: false, ...over });

const levels = (checks: ReturnType<typeof run>) => checks.map((c) => c.level);
const messages = (checks: ReturnType<typeof run>) => checks.map((c) => c.message).join(" | ");
const hoursAgo = (h: number) => ({ publishedAt: new Date(NOW.getTime() - h * 3_600_000) });

describe("blocks", () => {
  it("has nothing to say about a clean draft", () => {
    expect(run()).toEqual([]);
  });

  it.each(["published", "publishing"])("blocks a draft that is already %s, and only says that", (status) => {
    const checks = run({ draft: draft({ status }) });
    expect(checks).toHaveLength(1);
    expect(isBlocked(checks)).toBe(true);
    expect(checks[0].message).toContain(status);
  });

  it("blocks rejected drafts", () => {
    expect(messages(run({ draft: draft({ status: "rejected" }) }))).toContain("rejected");
  });

  it("blocks empty text", () => {
    expect(isBlocked(run({ draft: draft({ body: "  \n " }) }))).toBe(true);
  });

  it("blocks text over LinkedIn's 3,000 character limit, but allows exactly 3,000", () => {
    const over = run({ draft: draft({ body: "x".repeat(3001) }) });
    expect(isBlocked(over)).toBe(true);
    expect(messages(over)).toContain("3,001");
    expect(isBlocked(run({ draft: draft({ body: "x".repeat(3000) }) }))).toBe(false);
  });
});

describe("weekly limit", () => {
  // Thursday of the week of 21 Sep. Earlier posts are more than 20 hours old, so only the limit fires.
  const THU = at("2026-09-24T05:00:00Z");
  const three = [at("2026-09-21T05:00:00Z"), at("2026-09-22T05:00:00Z"), at("2026-09-23T05:00:00Z")].map((publishedAt) => ({ publishedAt }));

  it("asks for confirmation when published + scheduled this week reach the cap", () => {
    const checks = run({ now: THU, published: three, scheduled: [{ id: 2, at: at("2026-09-25T04:00:00Z") }] });
    expect(needsConfirmation(checks)).toBe(true);
    expect(messages(checks)).toContain("(3 published, 1 scheduled)");
    expect(messages(checks)).toContain("This would be number 5");
  });

  it("does not count the draft's own scheduled slot against itself", () => {
    const own = { id: 7, at: at("2026-09-25T04:00:00Z") };
    const checks = run({ now: THU, draft: draft({ id: 7, status: "scheduled", scheduledAt: own.at }), published: three, scheduled: [own] });
    expect(needsConfirmation(checks)).toBe(false);
  });

  it("is fine one below the cap and confirms exactly at it", () => {
    expect(needsConfirmation(run({ now: THU, published: three, cap: 4 }))).toBe(false);
    expect(needsConfirmation(run({ now: THU, published: three, cap: 3 }))).toBe(true);
  });

  it("also watches the rolling 7 days, so a busy end of last week counts", () => {
    const lastWeek = [at("2026-09-16T05:00:00Z"), at("2026-09-17T05:00:00Z"), at("2026-09-18T05:00:00Z")].map((publishedAt) => ({ publishedAt }));
    const checks = run({ published: lastWeek, cap: 3 });
    expect(needsConfirmation(checks)).toBe(true);
    expect(messages(checks)).toContain("last 7 days");
    expect(messages(checks)).not.toContain("This week already");
  });

  it("ignores posts older than a week and from other weeks", () => {
    expect(needsConfirmation(run({ published: [{ publishedAt: at("2026-09-01T05:00:00Z") }], cap: 1 }))).toBe(false);
  });
});

describe("gap between posts", () => {
  it("asks for confirmation when the last post was under 20 hours ago", () => {
    const checks = run({ published: [hoursAgo(2)] });
    expect(needsConfirmation(checks)).toBe(true);
    expect(messages(checks)).toContain("2 hours ago");
  });

  it("speaks in minutes when it was under an hour ago", () => {
    expect(messages(run({ published: [{ publishedAt: new Date(NOW.getTime() - 30 * 60_000) }] }))).toContain("30 minutes ago");
  });

  it("is fine at exactly 20 hours and beyond", () => {
    expect(needsConfirmation(run({ published: [hoursAgo(20)] }))).toBe(false);
    expect(needsConfirmation(run({ published: [hoursAgo(25)] }))).toBe(false);
  });

  it("measures from the most recent post, not the first in the list", () => {
    expect(needsConfirmation(run({ published: [hoursAgo(90), hoursAgo(3)] }))).toBe(true);
  });
});

describe("pause switch", () => {
  it("asks for confirmation because a manual post ignores the pause", () => {
    const checks = run({ paused: true });
    expect(needsConfirmation(checks)).toBe(true);
    expect(messages(checks)).toContain("paused");
  });
});

describe("notes (never need confirmation)", () => {
  const info = (over: Partial<RuleInput>) => run(over).filter((c) => c.level === "info");

  it("mentions off-hours: weekends, early morning and evening", () => {
    expect(info({ now: at("2026-09-19T10:00:00Z") })[0].message).toContain("It is 15:30 local time"); // Saturday
    expect(info({ now: at("2026-09-22T02:00:00Z") })).toHaveLength(1); // Tuesday 07:30 IST
    expect(info({ now: at("2026-09-22T13:30:00Z") })).toHaveLength(1); // Tuesday 19:00 IST
  });

  it("stays quiet inside posting hours on a posting day, including the edges", () => {
    expect(info({ now: NOW })).toEqual([]); // 10:30
    expect(info({ now: at("2026-09-22T02:30:00Z") })).toEqual([]); // 08:00 IST
    expect(info({ now: at("2026-09-22T13:29:00Z") })).toEqual([]); // 18:59 IST
  });

  it("says publishing a scheduled draft cancels its slot", () => {
    const checks = info({ draft: draft({ status: "scheduled", scheduledAt: at("2026-09-23T03:30:00Z") }) });
    expect(checks.map((c) => c.message).join()).toContain("cancels its slot");
  });

  it("says when the visual still has to render, but not when it is done or not wanted", () => {
    const withSpec = { mediaSpec: { kind: "carousel" }, mediaKind: "carousel" };
    expect(messages(run({ draft: draft(withSpec), mediaRendered: false }))).toContain("not rendered");
    expect(run({ draft: draft(withSpec), mediaRendered: true })).toEqual([]);
    expect(run({ draft: draft({ mediaSpec: {}, mediaKind: "none" }), mediaRendered: false })).toEqual([]);
  });

  it("reminds you about the manual first comment", () => {
    expect(messages(run({ draft: draft({ firstComment: "Sources: x" }) }))).toContain("first comment");
  });
});

describe("helpers", () => {
  it("tell blocks and confirmations apart", () => {
    expect(isBlocked([{ level: "confirm", message: "" }])).toBe(false);
    expect(needsConfirmation([{ level: "block", message: "" }])).toBe(false);
    expect(levels(run({ paused: true, draft: draft({ body: "" }) }))).toEqual(expect.arrayContaining(["block", "confirm"]));
  });
});
