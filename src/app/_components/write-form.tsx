"use client";

import { useActionState, useState } from "react";
import { btnPrimary, field } from "./ui";
import type { WriteState } from "../actions";
import { DEFAULT_STYLES, STYLES } from "@/lib/formats";

export type Trend = { id: number; title: string; url: string | null; angles: string[] };

type Props = {
  action: (prev: WriteState, form: FormData) => Promise<WriteState>;
  trends: Trend[];
  initialTrendId?: number;
};

const MAX_STYLES = 3;
const TAKE_MAX = 1200;

export function WriteForm({ action, trends, initialTrendId }: Props) {
  const initial = trends.find((t) => t.id === initialTrendId);
  const [state, formAction, pending] = useActionState(action, {});
  const [trendId, setTrendId] = useState<number | "">(initial?.id ?? "");
  const [topic, setTopic] = useState(initial?.title.slice(0, 200) ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [angle, setAngle] = useState("");
  const [take, setTake] = useState("");
  const [styles, setStyles] = useState<string[]>(DEFAULT_STYLES);
  const [visual, setVisual] = useState("");

  const trend = trends.find((t) => t.id === trendId);

  function pickTrend(value: string) {
    const t = trends.find((x) => x.id === Number(value));
    setTrendId(t ? t.id : "");
    setAngle("");
    if (t) {
      setTopic(t.title.slice(0, 200));
      setUrl(t.url ?? "");
    }
  }

  function toggleStyle(id: string) {
    setStyles((cur) => (cur.includes(id) ? cur.filter((s) => s !== id) : cur.length < MAX_STYLES ? [...cur, id] : cur));
  }

  const label = "block text-[15px] font-semibold text-ink";
  const hint = "mt-1 max-w-xl text-sm leading-relaxed text-muted";

  return (
    <form action={formAction} className="max-w-2xl space-y-9">
      {state.error ? (
        <div role="alert" className="border-l-4 border-pencil bg-paper px-4 py-3 text-[15px] leading-relaxed text-pencil">
          {state.error}
        </div>
      ) : null}

      {trends.length > 0 ? (
        <div>
          <label htmlFor="trend" className={label}>
            Start from a trend
          </label>
          <select id="trend" value={trendId} onChange={(e) => pickTrend(e.target.value)} className={`${field} mt-2 block w-full`}>
            <option value="">No, I have my own topic</option>
            {trends.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title.slice(0, 90)}
              </option>
            ))}
          </select>
          <input type="hidden" name="topicId" value={trendId} />
        </div>
      ) : null}

      <div>
        <label htmlFor="topic" className={label}>
          Topic
        </label>
        <p className={hint}>What should the AI research? A short phrase is fine.</p>
        <input id="topic" name="topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} required className={`${field} mt-2 block w-full`} placeholder="How AI lets one person build and sell software" />
      </div>

      <div>
        <label htmlFor="take" className={label}>
          Your take
        </label>
        <p className={hint}>
          What you actually think, in your own words. The post is built around this, and the AI will not invent an opinion or an experience for you.
        </p>
        <textarea
          id="take"
          name="take"
          value={take}
          onChange={(e) => setTake(e.target.value)}
          rows={5}
          maxLength={TAKE_MAX}
          required
          className={`${field} mt-2 block w-full leading-relaxed`}
          placeholder="I believe AI is changing what one person can build and earn. A single developer can now ship a website, an app and an AI tool alone."
        />
        <p className="mt-1 text-right text-sm text-muted tabular-nums">
          {take.length.toLocaleString("en-US")} of {TAKE_MAX.toLocaleString("en-US")}
        </p>
      </div>

      <div>
        <label htmlFor="url" className={label}>
          Source link <span className="font-normal text-muted">(optional)</span>
        </label>
        <p className={hint}>An article you want the post based on. Without one, the AI searches the web.</p>
        <input id="url" name="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} className={`${field} mt-2 block w-full`} placeholder="https://" />
      </div>

      <div>
        <label htmlFor="angle" className={label}>
          Angle <span className="font-normal text-muted">(optional)</span>
        </label>
        <p className={hint}>The specific point of view to take on the topic.</p>
        <input id="angle" name="angle" value={angle} onChange={(e) => setAngle(e.target.value)} maxLength={300} className={`${field} mt-2 block w-full`} />
        {trend && trend.angles.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {trend.angles.map((a) => (
              <li key={a}>
                <button type="button" onClick={() => setAngle(a.slice(0, 300))} className="text-left text-sm leading-relaxed text-proof underline underline-offset-2 hover:no-underline">
                  Use: {a}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <fieldset>
        <legend className={label}>Writing styles</legend>
        <p className={hint}>Each style is a separate draft, so you can compare. More styles take longer. Pick up to {MAX_STYLES}.</p>
        <div className="mt-3 border-t border-rule">
          {STYLES.map((s) => {
            const on = styles.includes(s.id);
            const locked = !on && styles.length >= MAX_STYLES;
            return (
              <label key={s.id} className={`flex items-start gap-3 border-b border-rule py-3 ${locked ? "opacity-50" : "cursor-pointer"}`}>
                <input type="checkbox" name="formats" value={s.id} checked={on} disabled={locked} onChange={() => toggleStyle(s.id)} className="mt-1 size-4 accent-[var(--color-ink)]" />
                <span>
                  <span className="block text-[15px] font-semibold">{s.label}</span>
                  <span className="block text-sm text-muted">{s.blurb}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="visual" className={label}>
          Visual
        </label>
        <p className={hint}>Decide later is faster: you only spend a minute or two rendering a visual for the draft you keep.</p>
        <select id="visual" name="visual" value={visual} onChange={(e) => setVisual(e.target.value)} className={`${field} mt-2 block w-full`}>
          <option value="">Decide later (recommended)</option>
          <option value="auto">Let the AI choose for every draft</option>
          <option value="carousel">PDF carousel for every draft</option>
          <option value="image">Image card for every draft</option>
          <option value="video">Short video for every draft</option>
        </select>
      </div>

      <div className="border-t border-rule pt-6">
        <button className={btnPrimary} disabled={pending}>
          {pending ? "Starting" : "Write drafts"}
        </button>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          This usually takes one to four minutes and runs in the background. Nothing is scheduled or published.
        </p>
      </div>
    </form>
  );
}
