import { pillars } from "../../../config/niche";
import type { Candidate } from "./discover";

export interface ScoredTopic extends Candidate {
  score: number;
  signals: { recency: number; crossSource: number; engagement: number; pillarFit: number };
  mentions: number;
}

const STOP = new Set(["the", "a", "an", "and", "of", "to", "in", "for", "on", "is", "with", "how", "why", "what", "at", "by", "from", "new"]);

function tokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function pillarFit(c: Candidate): number {
  if (c.pillar) return 1;
  const t = tokens(c.title);
  let best = 0;
  for (const p of pillars) {
    for (const k of p.keywords) best = Math.max(best, jaccard(t, tokens(k)) * 2);
  }
  return Math.min(1, best);
}

/** Cluster near-duplicate titles, then score each cluster. */
export function scoreCandidates(cands: Candidate[]): ScoredTopic[] {
  const clusters: { lead: Candidate; members: Candidate[]; tok: Set<string> }[] = [];
  for (const c of cands) {
    const tok = tokens(c.title);
    const match = clusters.find((cl) => jaccard(tok, cl.tok) >= 0.5);
    if (match) match.members.push(c);
    else clusters.push({ lead: c, members: [c], tok });
  }

  const maxPoints = Math.max(1, ...cands.map((c) => c.points));

  return clusters
    .map<ScoredTopic>(({ lead, members }) => {
      const sources = new Set(members.map((m) => new URL(m.url).hostname));
      const crossSource = Math.min(1, (sources.size - 1) / 2); // 3+ outlets = 1
      const points = Math.max(...members.map((m) => m.points));
      const engagement = points / maxPoints;
      const ages = members.map((m) => m.ageDays).filter((a): a is number => a !== undefined);
      const recency = ages.length ? Math.max(0, 1 - Math.min(...ages) / 7) : 0.5;
      const fit = Math.max(...members.map(pillarFit));
      const score = 0.25 * recency + 0.25 * crossSource + 0.35 * engagement + 0.15 * fit;
      const best = members.find((m) => m.pillar) ?? lead;
      return {
        ...lead,
        pillar: best.pillar,
        points,
        score: Math.round(score * 1000) / 1000,
        mentions: sources.size,
        signals: { recency, crossSource, engagement, pillarFit: fit },
      };
    })
    .filter((t) => t.signals.pillarFit > 0)
    // Bare product names ("AINA") give the model nothing real to build angles on.
    .filter((t) => t.title.trim().split(/\s+/).length >= 4)
    .sort((a, b) => b.score - a.score);
}
