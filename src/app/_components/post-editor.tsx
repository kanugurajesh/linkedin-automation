"use client";

import { useLayoutEffect, useRef, useState } from "react";

const FOLD = 210; // about where the feed truncates a post behind "see more"
const BAND = { low: 1000, high: 1600, scale: 2200 }; // the length range that tends to read best

/** Cut at a word boundary near the fold so the marker never lands mid-word. */
function splitAtFold(text: string): [string, string] {
  if (text.length <= FOLD) return [text, ""];
  const space = text.lastIndexOf(" ", FOLD);
  const cut = space > FOLD * 0.6 ? space : FOLD;
  return [text.slice(0, cut), text.slice(cut)];
}

type Props = {
  id: number;
  initial: string;
  author: string;
  readOnly?: boolean;
  action: (form: FormData) => Promise<void>;
};

export function PostEditor({ id, initial, author, readOnly, action }: Props) {
  const [text, setText] = useState(initial);
  const area = useRef<HTMLTextAreaElement>(null);
  const [head, tail] = splitAtFold(text.trim());
  const len = text.trim().length;
  const dirty = text !== initial;
  const pos = Math.min(100, (len / BAND.scale) * 100);
  const inBand = len >= BAND.low && len <= BAND.high;

  // Grow with the text so the whole post is always visible, never a scrolling box.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text]);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />

      <label htmlFor="body" className="mb-2 block text-lg font-semibold tracking-tight text-ink">
        Post text
      </label>
      <textarea
        ref={area}
        id="body"
        name="body"
        value={text}
        readOnly={readOnly}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[17px] leading-[1.6] text-text outline-offset-8"
      />

      <div className="mt-4">
        <div className="relative h-1.5 bg-rule-soft" aria-hidden>
          <div className="absolute inset-y-0 bg-leaf/25" style={{ left: `${(BAND.low / BAND.scale) * 100}%`, width: `${((BAND.high - BAND.low) / BAND.scale) * 100}%` }} />
          <div className="absolute -top-1 h-3.5 w-0.5 bg-ink" style={{ left: `${pos}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted">
          <span className="font-semibold text-text tabular-nums">{len.toLocaleString("en-US")}</span> characters.{" "}
          {inBand
            ? "Inside the 1,000 to 1,600 range that usually reads best."
            : len < BAND.low
              ? "Shorter than the usual 1,000 to 1,600 range. That is fine if it says everything."
              : "Longer than the usual 1,000 to 1,600 range. Trim what repeats."}
        </p>
      </div>

      {readOnly ? null : (
        <div className="mt-5 flex items-center gap-4">
          <button className="rounded-[3px] bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink-soft disabled:opacity-50" disabled={!dirty}>
            Save text
          </button>
          <span className="text-sm text-muted" aria-live="polite">
            {dirty ? "Unsaved changes" : "Saved"}
          </span>
        </div>
      )}

      <section aria-labelledby="feed-preview" className="mt-10 border-t border-rule pt-6">
        <h3 id="feed-preview" className="text-lg font-semibold tracking-tight text-ink">
          What the feed shows first
        </h3>
        <p className="mb-4 mt-1 max-w-xl text-sm leading-relaxed text-muted">
          Readers see roughly the first {FOLD} characters, then a “see more” link. Most decide there. The highlight marks the cut.
        </p>
        <div className="max-w-xl border border-rule bg-sheet p-5">
          <p className="mb-3 text-[15px] font-semibold">{author}</p>
          <div className="whitespace-pre-wrap text-[15px] leading-[1.55]">
            {head || <span className="text-muted">Your post will appear here.</span>}
            {tail ? <span className="fold-mark"> …see more</span> : null}
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">
          {tail ? (
            <>
              <span className="font-semibold text-text tabular-nums">{tail.trim().length.toLocaleString("en-US")}</span> more characters sit behind “see more”. Make the part above earn the tap.
            </>
          ) : (
            "The whole post fits before the cut."
          )}
        </p>
      </section>
    </form>
  );
}
