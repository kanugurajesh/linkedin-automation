/** About where the LinkedIn feed truncates a post behind "see more". */
export const FOLD = 210;

/** Cut at a word boundary near the fold so the marker never lands mid-word. */
export function splitAtFold(text: string): [string, string] {
  if (text.length <= FOLD) return [text, ""];
  const space = text.lastIndexOf(" ", FOLD);
  const cut = space > FOLD * 0.6 ? space : FOLD;
  return [text.slice(0, cut), text.slice(cut)];
}
