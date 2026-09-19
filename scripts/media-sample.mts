/** Renders one sample of each format into out/draft-0 so you can eyeball the design. */
import { renderSpec } from "../src/lib/media/render";
import type { MediaSpec } from "../remotion/types";

const specs: MediaSpec[] = [
  {
    kind: "carousel",
    slides: [
      { heading: "Stop using LLMs to write faster" },
      { heading: "Use them to edit your thinking", body: "Write the piece first. Then ask a model to find the flaws." },
      { heading: "Ban their phrasing", body: "Rule one: don't use a single word the model suggests." },
      { heading: "Forbid encouragement", body: "Praise feels good and teaches you nothing about the draft." },
      { heading: "Compare, then decide", body: "Rewrite the section yourself, then ask which version is better." },
      { heading: "The model pressure-tests. You keep the voice." },
    ],
  },
  { kind: "image", quote: "Don't ask the model to make you feel better about a draft. Ask it to find what you don't need.", attribution: "Your Name" },
  { kind: "video", stat: { value: "750", label: "words a good editor found to cut" }, bullets: ["Ask for problems, not praise", "Rewrite the section yourself", "Then compare both versions"] },
];

for (const spec of specs) {
  const t = Date.now();
  const r = await renderSpec(0, spec);
  console.log(`${spec.kind}: ${r.path} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}
process.exit(0);
