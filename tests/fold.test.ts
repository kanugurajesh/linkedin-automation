import { describe, expect, it } from "vitest";
import { FOLD, splitAtFold } from "@/lib/fold";

describe("splitAtFold", () => {
  it("keeps short text whole", () => {
    expect(splitAtFold("Short post.")).toEqual(["Short post.", ""]);
    expect(splitAtFold("a".repeat(FOLD))).toEqual(["a".repeat(FOLD), ""]);
  });

  it("cuts at a word boundary at or before the fold", () => {
    const text = "word ".repeat(60).trim();
    const [head, tail] = splitAtFold(text);
    expect(head.length).toBeLessThanOrEqual(FOLD);
    expect(head.endsWith("word")).toBe(true);
    expect(tail.startsWith(" ")).toBe(true);
  });

  it("never loses or reorders text", () => {
    const text = "The quick brown fox jumps over the lazy dog. ".repeat(20);
    const [head, tail] = splitAtFold(text);
    expect(head + tail).toBe(text);
  });

  it("cuts exactly at the fold when there is no usable space (one long word)", () => {
    const [head, tail] = splitAtFold("x".repeat(500));
    expect(head).toHaveLength(FOLD);
    expect(tail).toHaveLength(500 - FOLD);
  });
});
