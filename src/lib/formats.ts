/** Writing styles. Light module (no OpenAI/DB imports) so both the writer and the web form can use it. */
export const STYLES = [
  {
    id: "contrarian",
    label: "Contrarian",
    blurb: "Opens with a claim people will push back on, then backs it up.",
    hint: "Open with a claim most people in the field would push back on, then back it with the facts.",
  },
  {
    id: "analysis",
    label: "Analysis",
    blurb: "Leads with the most surprising number or finding, then explains it.",
    hint: "Lead with the single most surprising number or finding, then explain what it means.",
  },
  {
    id: "listicle",
    label: "Numbered list",
    blurb: "3 to 5 concrete points, one line each.",
    hint: "A numbered list (1., 2., 3.) of 3-5 concrete points, each one line plus a specific detail. Keep the numbering.",
  },
  {
    id: "howto",
    label: "How to",
    blurb: "Steps someone could follow today.",
    hint: "Give a practical sequence of steps someone could follow today, grounded in the facts.",
  },
  {
    id: "story",
    label: "Story",
    blurb: "Tells what happened to the people in the source. Tends to be the weakest.",
    hint: "Tell it as a short sequence of events from the facts, told about the source or the people in it. Do not invent scenes or personal history for the author beyond their take.",
  },
] as const;

export const FORMAT_HINTS: Record<string, string> = Object.fromEntries(STYLES.map((s) => [s.id, s.hint]));
export const DEFAULT_STYLES = ["contrarian", "analysis"];
