export const METRIC_FIELDS = ["impressions", "reactions", "comments"] as const;
export type MetricField = (typeof METRIC_FIELDS)[number];
export type MetricRow = { id: number; m: Partial<Record<MetricField, number>> };

/**
 * Parses metrics CSV text. A header row is required: `post` (the id from `queue posts`) plus any of
 * impressions, reactions, comments. Blank lines and lines starting with # are ignored. Throws on the
 * first bad row so nothing is half-applied.
 */
export function parseMetricsCsv(csv: string): MetricRow[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (lines.length < 2) throw new Error("CSV needs a header row and at least one data row");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col("post") < 0) throw new Error('CSV header must include a "post" column (the id from `queue posts`)');
  if (!METRIC_FIELDS.some((f) => col(f) >= 0)) throw new Error("CSV header needs at least one of: impressions, reactions, comments");

  const rows: MetricRow[] = [];
  for (const [i, line] of lines.slice(1).entries()) {
    const cells = line.split(",").map((c) => c.trim());
    const id = Number(cells[col("post")]);
    if (!Number.isInteger(id)) throw new Error(`Row ${i + 2}: bad post id "${cells[col("post")]}"`);
    const m: MetricRow["m"] = {};
    for (const f of METRIC_FIELDS) {
      if (col(f) < 0 || cells[col(f)] === "" || cells[col(f)] === undefined) continue;
      const n = Number(cells[col(f)].replaceAll(",", ""));
      if (!Number.isInteger(n) || n < 0) throw new Error(`Row ${i + 2}: bad ${f} "${cells[col(f)]}"`);
      m[f] = n;
    }
    rows.push({ id, m });
  }
  return rows;
}
