import { describe, expect, it } from "vitest";
import type { Job } from "@/lib/jobs";
import { toView } from "@/lib/jobs-view";

const job = (params: Record<string, unknown>): Job => ({
  id: 4,
  kind: "publish",
  params,
  status: "running",
  step: "Publishing the post to LinkedIn",
  log: ["Checking the post one last time"],
  result: null,
  error: null,
  createdAt: new Date("2026-09-22T05:00:00Z"),
  updatedAt: new Date("2026-09-22T05:00:10Z"),
});

describe("toView", () => {
  it("exposes progress fields and the draft id", () => {
    expect(toView(job({ draftId: 7 }))).toEqual({
      id: 4,
      kind: "publish",
      status: "running",
      step: "Publishing the post to LinkedIn",
      log: ["Checking the post one last time"],
      result: null,
      error: null,
      draftId: 7,
      createdAt: new Date("2026-09-22T05:00:00Z").getTime(),
    });
  });

  it("never sends the raw params to the browser (they hold the author's take and links)", () => {
    const view = toView(job({ draftId: 7, take: "private opinion", url: "https://secret.example" }));
    expect(JSON.stringify(view)).not.toContain("private opinion");
    expect(JSON.stringify(view)).not.toContain("secret.example");
  });

  it("returns a null draft id when the job has none", () => {
    expect(toView(job({ topic: "AI" })).draftId).toBeNull();
    expect(toView(job({ draftId: "7" })).draftId).toBeNull();
  });
});
