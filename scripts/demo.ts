/**
 * `npm run demo`: run the dashboard on made-up sample data, with no API keys.
 *
 * Safety: every credential is replaced with a placeholder for the server process (process env wins
 * over .env.local), and the app refuses writing, rendering and publishing while DEMO_MODE=1. The
 * sample database lives in data/demo.db, separate from your real data/app.db.
 *
 * `npm run demo:seed` only rebuilds the sample database.
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const DEMO_DB = "file:./data/demo.db";
const PORT = process.env.PORT ?? "3200";
const seedOnly = process.argv.includes("--seed-only");

const DEMO_ENV = {
  DEMO_MODE: "1",
  DATABASE_URL: DEMO_DB,
  FIRECRAWL_API_KEY: "demo-disabled",
  OPENAI_API_KEY: "demo-disabled",
  OPENAI_MODEL: "demo-disabled",
  LINKEDIN_CLIENT_ID: "demo-disabled",
  LINKEDIN_CLIENT_SECRET: "demo-disabled",
  LINKEDIN_REDIRECT_URI: "http://localhost:3000/api/linkedin/callback",
  LINKEDIN_ACCESS_TOKEN: "demo-disabled",
  LINKEDIN_PERSON_URN: "urn:li:person:demo",
  LINKEDIN_AUTO_COMMENT: "false",
};

const CAROUSEL = {
  kind: "carousel" as const,
  slides: [
    { heading: "Automation fails at the boring part" },
    { heading: "The model was fine", body: "A postmortem traced a double post to the retry logic, not the AI." },
    { heading: "Three questions decide it", body: "Who approves it? What if it runs twice? Where are the numbers checked?" },
    { heading: "Build the safety layer first", body: "One owner per step, a human approval, and one home for the rules." },
    { heading: "Trust is the product", body: "People rely on a system they can predict." },
    { heading: "Which step keeps a human in it?" },
  ],
};

const BODIES = {
  contrarian: [
    "Most automation projects don't fail at the clever part. They fail at the boring part nobody owns.",
    "A team can get an AI drafting step working in an afternoon. Then it takes weeks to settle everything around it. Who approves the output? What happens when the same job runs twice? Where do the numbers get checked?",
    "One public postmortem traced a double post to a retry loop. The model behaved. The retry logic did not.",
    "Speed is easy to measure, so teams optimise it first. Trust is harder to measure, so it gets postponed until something goes wrong in public.",
    "That points to a safer order of work:\n\n1. Give every step one owner.\n2. Put a human approval in front of anything public.\n3. Keep the rules in one place, so they cannot drift apart.",
    "None of it is glamorous. All of it decides whether the system earns trust.",
    "The clever part gets the demo. The boring part gets the users.",
    "Which step in your automation still needs a human?",
  ].join("\n\n"),
  analysis: [
    "The same update went out twice, and the model was never at fault.",
    "A postmortem describes a job that timed out, retried, and posted again. Nothing in the retry checked whether the first attempt had already succeeded.",
    "The fix was small. Claim the job before doing the work, so only one attempt can proceed.",
    "The lesson is not about AI. It is about any system that can act twice on one decision.",
    "Before automating a public action, ask what happens when it runs twice.",
  ].join("\n\n"),
  listicle: [
    "Four checks before an automated post goes out:",
    "1. Is the text under the platform limit?\n2. Has anything gone out in the last day?\n3. Is this week's limit already used?\n4. Is publishing paused?",
    "Each check is a small rule. Together they turn publish now into a decision instead of a click.",
    "The rules should live in one place, so the button, the scheduler and the command line all agree.",
  ].join("\n\n"),
  howto: [
    "A practical way to keep a human in the loop:",
    "Start every generated draft as needs review. Show the sources next to the text. Require a click to schedule. Log what was approved and when.",
    "It adds a minute per post and removes the fear of the bot saying something nobody read.",
  ].join("\n\n"),
  story: [
    "A weekend build: a small team wired an assistant to answer inbound messages, then spent the following week on everything else.",
    "The assistant was the easy part. Handoffs, tone, and what to do when it does not know were the work.",
    "Ship the boring parts first.",
  ].join("\n\n"),
  rejected: "Ten AI tools you must try today.\n\nThis draft was rejected: it reads like a list of links and says nothing.",
};

const facts = (n: string) => [
  { claim: "A public postmortem describes a job that timed out, retried, and published the same update twice.", sourceUrl: `https://example.com/${n}/postmortem` },
  { claim: "The retry logic did not check whether the first attempt had already succeeded.", sourceUrl: `https://example.com/${n}/postmortem` },
  { claim: "The team fixed it by claiming the job before doing any work.", sourceUrl: `https://example.com/${n}/follow-up` },
];

async function seed() {
  // Import after DATABASE_URL is set: the db module reads it when first loaded.
  process.env.DATABASE_URL = DEMO_DB;
  const { db, drafts, jobs, posts, topics } = await import("../src/lib/db");
  const { scheduleDraft } = await import("../src/lib/queue-core");

  await db.insert(topics).values([
    { title: "A three-person team shipped an AI booking assistant in one weekend", url: "https://example.com/booking-assistant", source: "hn", pillar: "AI engineering", score: 0.71, angles: ["The weekend build is the easy part: handoffs are where these projects live or die.", "Small teams win here because they have nobody to wait for.", "What a booking assistant should refuse to do."] },
    { title: "Why most chat automations fail after week two", url: "https://example.com/week-two", source: "news", pillar: "Building products", score: 0.64, angles: ["Week two is when real customers arrive with real edge cases.", "The fix is boring: review the conversations every day."] },
    { title: "Postmortem: a retry loop that posted the same update twice", url: "https://example.com/retry-loop", source: "hn", pillar: "AI engineering", score: 0.58, angles: ["The model was fine. The retry logic was not.", "Claim the job before you do the work."] },
    { title: "Junior developers are learning with coding agents first", url: "https://example.com/juniors-agents", source: "news", pillar: "Software careers", score: 0.52, angles: ["Reviewing generated code is now a core skill.", "What hiring managers can ask to test it."] },
    { title: "Small businesses lose leads to slow replies across chat apps", url: "https://example.com/slow-replies", source: "news", pillar: "Building products", score: 0.47, angles: ["The reply is the product for a small business."] },
    { title: "Open-source scheduler adds timezone-safe recurring jobs", url: "https://example.com/scheduler", source: "hn", pillar: "AI engineering", score: 0.41, angles: ["Time zones are where schedulers quietly go wrong."] },
  ]);

  const media = path.resolve("out/draft-1");
  mkdirSync(media, { recursive: true });
  for (const f of readdirSync("docs/demo-media")) copyFileSync(path.join("docs/demo-media", f), path.join(media, f));

  const base = { batchId: "demo", personalTake: "Automation earns trust in the boring parts, not the clever ones." };
  const insert = async (v: Partial<typeof drafts.$inferInsert> & { format: string; body: string }) =>
    (await db.insert(drafts).values({ ...base, hook: v.body.split("\n")[0], firstComment: "Sources:\nhttps://example.com/postmortem", facts: facts("sample"), ...v }).returning({ id: drafts.id }))[0].id;

  await insert({ format: "contrarian", body: BODIES.contrarian, mediaKind: "carousel", mediaSpec: CAROUSEL, mediaPath: path.join(media, "carousel.pdf") });
  await insert({ format: "analysis", body: BODIES.analysis });
  const scheduledId = await insert({ format: "listicle", body: BODIES.listicle });
  await insert({ format: "howto", body: BODIES.howto, status: "failed", error: "LinkedIn POST /rest/posts failed: 401 (token expired or revoked: re-run `npm run linkedin:auth`)" });
  const publishedId = await insert({ format: "story", body: BODIES.story, status: "published" });
  await insert({ format: "contrarian", body: BODIES.rejected, status: "rejected" });

  await scheduleDraft(scheduledId);
  await db.insert(posts).values({ draftId: publishedId, linkedinUrn: "urn:li:share:sample", publishedAt: new Date(Date.now() - 3 * 3_600_000), impressions: 1840, reactions: 63, comments: 9 });

  await db.insert(jobs).values({
    kind: "write",
    params: { topic: "A three-person team shipped an AI booking assistant in one weekend", take: "Automation earns trust in the boring parts, not the clever ones.", formats: ["contrarian", "analysis"], topicId: 1 },
    status: "done",
    step: null,
    log: [
      "Searching the web and reading the sources",
      "Found 9 facts in 3 sources",
      "Writing 2 drafts from your take and the sources",
      "Polishing each draft: natural wording, stronger opening, fact and claim checks",
      "Polishing each draft (2 of 2 finished)",
    ],
    result: { draftIds: [1, 2], unresolved: 0, visualErrors: [] },
  });
}

async function main() {
  mkdirSync("data", { recursive: true });
  rmSync("data/demo.db", { force: true });
  rmSync("out/draft-1", { recursive: true, force: true });

  console.log("Creating the sample database...");
  const push = spawnSync(process.execPath, [path.resolve("node_modules/drizzle-kit/bin.cjs"), "push"], { env: { ...process.env, DATABASE_URL: DEMO_DB }, stdio: "pipe" });
  if (push.status !== 0) throw new Error(`Could not create the sample database:\n${push.stdout}\n${push.stderr}`);
  await seed();
  console.log("Sample data ready.");
  if (seedOnly) return;

  const next = path.resolve("node_modules/next/dist/bin/next");
  // Always build: a stale build from earlier work would silently lack the demo guards and banner.
  console.log("Building the app (about a minute the first time)...");
  const build = spawnSync(process.execPath, [next, "build"], { env: { ...process.env, ...DEMO_ENV }, stdio: "inherit" });
  if (build.status !== 0) throw new Error("The build failed. Run npm run build to see why.");

  console.log(`\nDemo running at http://127.0.0.1:${PORT}  (Ctrl+C to stop)\n`);
  const server = spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", PORT], { env: { ...process.env, ...DEMO_ENV }, stdio: "inherit" });
  server.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
