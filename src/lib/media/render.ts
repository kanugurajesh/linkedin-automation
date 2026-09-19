import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { PDFDocument } from "pdf-lib";
import type { MediaSpec } from "../../../remotion/types";

export type Rendered = { path: string; kind: "document" | "image" | "video" };

let bundled: Promise<string> | undefined;
/** Bundling takes a few seconds, so do it once per process. */
function serveUrl(): Promise<string> {
  bundled ??= bundle({ entryPoint: path.resolve("remotion/index.ts") });
  return bundled;
}

async function still(id: string, inputProps: Record<string, unknown>, output: string) {
  const url = await serveUrl();
  const composition = await selectComposition({ serveUrl: url, id, inputProps });
  await renderStill({ composition, serveUrl: url, output, inputProps, imageFormat: "png" });
}

export async function renderSpec(draftId: number, spec: MediaSpec): Promise<Rendered> {
  const dir = path.resolve("out", `draft-${draftId}`);
  await mkdir(dir, { recursive: true });

  if (spec.kind === "image") {
    const output = path.join(dir, "card.png");
    await still("QuoteCard", { quote: spec.quote, attribution: spec.attribution }, output);
    return { path: output, kind: "image" };
  }

  if (spec.kind === "carousel") {
    const pdf = await PDFDocument.create();
    const total = spec.slides.length;
    for (const [index, slide] of spec.slides.entries()) {
      const png = path.join(dir, `slide-${String(index + 1).padStart(2, "0")}.png`);
      await still("CarouselSlide", { ...slide, index, total }, png);
      const img = await pdf.embedPng(await readFile(png));
      pdf.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    const output = path.join(dir, "carousel.pdf");
    await writeFile(output, await pdf.save());
    return { path: output, kind: "document" };
  }

  const url = await serveUrl();
  const inputProps = { value: spec.stat.value, label: spec.stat.label, bullets: spec.bullets };
  const composition = await selectComposition({ serveUrl: url, id: "StatVideo", inputProps });
  const output = path.join(dir, "video.mp4");
  await renderMedia({ composition, serveUrl: url, codec: "h264", outputLocation: output, inputProps });
  return { path: output, kind: "video" };
}
