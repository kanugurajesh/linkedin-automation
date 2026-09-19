/**
 * Your niche. Discovery is filtered to these pillars so the feed stays on-brand.
 * Edit freely: keywords drive Firecrawl news searches, listing pages give engagement signals.
 */
export interface Pillar {
  name: string;
  keywords: string[];
}

export const pillars: Pillar[] = [
  { name: "AI engineering", keywords: ["AI agents", "LLM applications", "developer tools AI"] },
  { name: "Software careers", keywords: ["software engineer career", "tech layoffs hiring"] },
  { name: "Building products", keywords: ["startup lessons", "indie hackers product launch"] },
];

/** Listing pages scraped for engagement signals (points / upvotes). */
export const listingSources = [
  { source: "hn", url: "https://news.ycombinator.com/" },
  { source: "producthunt", url: "https://www.producthunt.com/" },
  // Reddit often blocks scrapers; enable per-subreddit if it works for you.
  // { source: "reddit", url: "https://www.reddit.com/r/programming/hot/" },
] as const;

/** Only consider stories from roughly the last N days (Firecrawl `tbs` filter). */
export const freshnessDays = 7;
