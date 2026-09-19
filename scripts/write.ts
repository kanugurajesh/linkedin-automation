import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { research } from "../src/lib/ai/research";
import { writePosts } from "../src/lib/ai/write";
import { db, topics } from "../src/lib/db";

const { values } = parseArgs({
  options: {
    topic: { type: "string" }, // topic id from `npm run discover`
    text: { type: "string" }, // or a free-text topic
    url: { type: "string" }, // optional seed URL for free-text topics
    angle: { type: "string" },
    take: { type: "string" }, // your one-line opinion / experience (required)
    variants: { type: "string", default: "3" },
  },
});

async function main() {
  if (!values.take) {
    throw new Error('--take "your one-line opinion or experience" is required: it is what makes the post yours');
  }

  let title = values.text;
  let url = values.url;
  let topicId: number | undefined;
  let angle = values.angle;

  if (values.topic) {
    const [t] = await db.select().from(topics).where(eq(topics.id, Number(values.topic)));
    if (!t) throw new Error(`No topic with id ${values.topic}`);
    title = t.title;
    url = t.url ?? undefined;
    topicId = t.id;
    angle ??= t.angles?.[0];
  }
  if (!title) throw new Error("Pass --topic <id> or --text \"...\"");

  console.log(`Researching: ${title}`);
  const t0 = Date.now();
  const facts = await research(title, url);
  console.log(`${facts.length} facts from ${new Set(facts.map((f) => f.sourceUrl)).size} sources (${Math.round((Date.now() - t0) / 1000)}s)`);

  console.log("Writing...");
  const written = await writePosts({ topicId, topic: title, angle, personalTake: values.take, facts, variants: Number(values.variants) });

  console.log(`writing took ${Math.round((Date.now() - t0) / 1000)}s total`);
  for (const d of written) {
    console.log(`\n===== draft #${d.id} (${d.format}) =====\n${d.body}`);
    if (d.remainingIssues.length) {
      console.log(`\n[!] unresolved: ${d.remainingIssues.map((i) => `${i.rule} (${i.detail})`).join(", ")}`);
    }
  }
  if (topicId) await db.update(topics).set({ status: "used" }).where(eq(topics.id, topicId));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
