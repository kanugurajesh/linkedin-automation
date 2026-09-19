import { describe, expect, it } from "vitest";
import { escapeCommentary } from "@/lib/linkedin/text";

describe("escapeCommentary", () => {
  it("escapes every character LinkedIn treats as markup", () => {
    expect(escapeCommentary("Use (parens), [brackets] {x} a_b *bold* @you <b> a|b ~ \\")).toBe(
      "Use \\(parens\\), \\[brackets\\] \\{x\\} a\\_b \\*bold\\* \\@you \\<b\\> a\\|b \\~ \\\\",
    );
  });

  it("puts exactly one backslash before each reserved character", () => {
    expect(escapeCommentary("(")).toBe("\\(");
    expect(escapeCommentary("(")).toHaveLength(2);
    expect(escapeCommentary("\\")).toBe("\\\\");
  });

  it("leaves hashtags and ordinary punctuation alone", () => {
    expect(escapeCommentary('Shipped 50% faster! #ai #buildinpublic. Really: yes, "quoted" & done.')).toBe(
      'Shipped 50% faster! #ai #buildinpublic. Really: yes, "quoted" & done.',
    );
  });

  it("does not change plain text or newlines", () => {
    expect(escapeCommentary("Line one.\n\nLine two.")).toBe("Line one.\n\nLine two.");
    expect(escapeCommentary("")).toBe("");
  });
});
