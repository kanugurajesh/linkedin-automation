/**
 * LinkedIn parses post text as "little text format": these characters are reserved and an
 * unescaped ( ) [ ] { } can silently truncate the post. `#` is left alone so hashtags work.
 */
export function escapeCommentary(text: string): string {
  return text.replace(/[\\|{}@\[\]()<>*_~]/g, (c) => `\\${c}`);
}
