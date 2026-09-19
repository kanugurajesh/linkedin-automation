import { describe, expect, it } from "vitest";
import { parseMetricsCsv } from "@/lib/metrics-csv";

describe("parseMetricsCsv", () => {
  it("reads rows by header name, in any column order", () => {
    expect(parseMetricsCsv("comments,post,impressions\n3,2,1234\n0,5,80")).toEqual([
      { id: 2, m: { comments: 3, impressions: 1234 } },
      { id: 5, m: { comments: 0, impressions: 80 } },
    ]);
  });

  it("ignores blank lines, # comments, Windows line endings and header case", () => {
    expect(parseMetricsCsv("# exported today\r\n\r\nPost, Reactions\r\n2, 9\r\n")).toEqual([{ id: 2, m: { reactions: 9 } }]);
  });

  it("skips empty cells instead of writing zero", () => {
    expect(parseMetricsCsv("post,impressions,reactions\n2,,7")).toEqual([{ id: 2, m: { reactions: 7 } }]);
  });

  it("needs a header and a data row", () => {
    expect(() => parseMetricsCsv("post,impressions")).toThrow("header row and at least one data row");
    expect(() => parseMetricsCsv("")).toThrow("header row");
  });

  it("needs a post column and at least one metric column", () => {
    expect(() => parseMetricsCsv("id,impressions\n1,5")).toThrow('"post" column');
    expect(() => parseMetricsCsv("post,views\n1,5")).toThrow("impressions, reactions, comments");
  });

  it("names the row of the first bad value, and rejects negatives and decimals", () => {
    expect(() => parseMetricsCsv("post,impressions\n1,10\nabc,5")).toThrow('Row 3: bad post id "abc"');
    expect(() => parseMetricsCsv("post,impressions\n1,-5")).toThrow('Row 2: bad impressions "-5"');
    expect(() => parseMetricsCsv("post,impressions\n1,-1")).toThrow('Row 2: bad impressions "-1"'); // boundary
    expect(parseMetricsCsv("post,impressions\n1,0")).toEqual([{ id: 1, m: { impressions: 0 } }]); // zero is valid
    expect(() => parseMetricsCsv("post,reactions\n1,2.5")).toThrow('Row 2: bad reactions "2.5"');
  });
});
