import { readFileSync } from "node:fs";
import type { MediaKind } from "../src/lib/ai/media";
import { checkAuth } from "../src/lib/linkedin/client";
import { publishDraft } from "../src/lib/publish";
import { approve, deletePublishedPost, editBody, getDraft, importMetrics, isBlocked, isPaused, listDrafts, listPosts, needsConfirmation, publishChecks, recordMetrics, reject, setMedia, setPaused, stats } from "../src/lib/queue";
import { formatLocal } from "../src/lib/schedule";
import { parseArgs } from "node:util";

const HELP = `Usage: npm run queue -- <command> [args]

  list [--status draft|scheduled|published|failed|rejected]
  show <id>
  media <id> [--kind carousel|image|video|none]   plan + render the visual (LLM picks if no --kind)
  edit <id> --file post.txt                        replace the post text
  approve <id> [--at "2026-09-23T09:00"]           schedule (next free slot unless --at, local time)
  reject <id>
  publish <id> [--dry-run] [--yes]                 post right now. Prints the safety checks; over your limits needs --yes
  retry <id>                                       failed -> scheduled at the next slot
  delete-post <postId>                             remove a published post from LinkedIn (and the weekly count)
  pause | resume                                   stop/start the worker publishing
  posts                                            published posts: id, link, and metrics entered so far
  metrics <postId> --impressions N --reactions N --comments N
  metrics-import --file metrics.csv                bulk entry; header: post,impressions,reactions,comments
  stats                                            what performs, from the metrics you entered
  auth                                             check the LinkedIn token
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    status: { type: "string" },
    kind: { type: "string" },
    file: { type: "string" },
    at: { type: "string" },
    "dry-run": { type: "boolean" },
    yes: { type: "boolean" },
    impressions: { type: "string" },
    reactions: { type: "string" },
    comments: { type: "string" },
  },
});

const [cmd, arg] = positionals;
const id = () => {
  const n = Number(arg);
  if (!Number.isInteger(n)) throw new Error(`${cmd} needs a numeric id`);
  return n;
};

async function main() {
  switch (cmd) {
    case "list": {
      for (const d of await listDrafts(values.status)) {
        const when = d.scheduledAt ? ` @ ${formatLocal(d.scheduledAt)}` : "";
        console.log(`#${d.id}  ${d.status.padEnd(10)} ${d.format.padEnd(10)} media:${(d.mediaKind ?? "none").padEnd(8)}${when}\n      ${d.hook.slice(0, 90)}`);
      }
      break;
    }
    case "show": {
      const d = await getDraft(id());
      console.log(`#${d.id} [${d.status}] ${d.format}${d.scheduledAt ? ` @ ${formatLocal(d.scheduledAt)}` : ""}\n\n${d.body}\n\n--- first comment ---\n${d.firstComment ?? "(none)"}\n--- media: ${d.mediaKind ?? "none"} ${d.mediaPath ?? ""}`);
      if (d.error) console.log(`--- error: ${d.error}`);
      break;
    }
    case "media": {
      const kind = values.kind as MediaKind | undefined;
      if (kind && !["carousel", "image", "video", "none"].includes(kind)) throw new Error("--kind must be carousel|image|video|none");
      const r = await setMedia(id(), kind);
      console.log(r ? `Rendered ${r.spec.kind}: ${r.path}` : "No visual for this draft.");
      break;
    }
    case "edit": {
      if (!values.file) throw new Error("edit needs --file <path>");
      await editBody(id(), readFileSync(values.file, "utf8"));
      console.log("Updated. If the story changed, re-run `media` so the visual matches.");
      break;
    }
    case "approve": {
      const at = values.at ? new Date(values.at) : undefined;
      if (at && Number.isNaN(at.getTime())) throw new Error(`Bad --at: ${values.at}`);
      console.log(`Scheduled for ${formatLocal(await approve(id(), at))}`);
      break;
    }
    case "reject":
      await reject(id());
      console.log("Rejected.");
      break;
    case "publish": {
      const checks = await publishChecks(id());
      for (const c of checks) console.log(`${{ block: "BLOCKED", confirm: "WARNING", info: "note" }[c.level]}: ${c.message}`);
      if (isBlocked(checks)) throw new Error("Not published.");
      if (needsConfirmation(checks) && !values["dry-run"] && !values.yes) {
        throw new Error("This goes outside your usual limits. Read the warnings above, and add --yes if you still want to publish it.");
      }
      const r = await publishDraft(id(), { dryRun: values["dry-run"], from: ["draft", "scheduled", "failed"] });
      if (!r.dryRun) {
        console.log(`Published: ${r.postUrn}`);
        if (r.commentFailed) console.log(`First comment failed: ${r.commentFailed}`);
        if (r.manualComment) console.log(`\nPaste this as the first comment on the post:\n${r.manualComment}`);
      }
      break;
    }
    case "retry": {
      const d = await getDraft(id());
      if (d.status !== "failed") throw new Error(`Draft #${d.id} is "${d.status}", only failed drafts can be retried`);
      console.log(`Scheduled for ${formatLocal(await approve(d.id))}`);
      break;
    }
    case "delete-post": {
      const n = Number(arg);
      await deletePublishedPost(n);
      console.log("Deleted from LinkedIn. The draft is back in your drafts and the post no longer counts toward the weekly limit.");
      break;
    }
    case "pause":
      await setPaused(true);
      console.log("Paused: the worker will not publish.");
      break;
    case "resume":
      await setPaused(false);
      console.log("Resumed.");
      break;
    case "metrics": {
      const num = (v?: string) => (v === undefined ? undefined : Number(v));
      await recordMetrics(id(), { impressions: num(values.impressions), reactions: num(values.reactions), comments: num(values.comments) });
      console.log("Saved.");
      break;
    }
    case "posts": {
      const rows = await listPosts();
      if (!rows.length) console.log("No published posts yet.");
      for (const p of rows) {
        const m = p.impressions == null ? "no metrics yet" : `${p.impressions} impressions, ${p.reactions ?? "?"} reactions, ${p.comments ?? "?"} comments`;
        console.log(`#${p.id}  ${formatLocal(p.publishedAt)}  [${p.format}]\n      ${p.hook.slice(0, 80)}\n      ${p.url}\n      ${m}`);
      }
      break;
    }
    case "metrics-import": {
      if (!values.file) throw new Error("metrics-import needs --file <csv>");
      console.log(`Saved metrics for ${await importMetrics(readFileSync(values.file, "utf8"))} post(s).`);
      break;
    }
    case "stats": {
      const rows = await stats();
      console.table(rows.length ? rows : [{ note: "no published posts yet" }]);
      break;
    }
    case "auth": {
      const a = await checkAuth();
      console.log(`Token OK for ${a.name} (source: ${a.source}). Person URN ${a.urnMatches ? "matches" : "DOES NOT MATCH"} the token. Worker is ${(await isPaused()) ? "PAUSED" : "active"}.`);
      break;
    }
    default:
      console.log(HELP);
  }
}

// Set exitCode and let the event loop drain: process.exit() trips a libuv assertion on Node 24 / Windows.
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
