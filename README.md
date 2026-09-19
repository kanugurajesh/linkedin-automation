# LinkedIn Automation

Finds trending topics, researches them, drafts posts in your voice, renders a visual, and publishes to LinkedIn on a schedule. You review and approve every post; nothing goes out on its own.

```
discover → pick a topic + your take → write drafts → (visual) → review → approve → schedule → publish → log metrics
 Firecrawl        you              OpenAI         Remotion       you      you       worker      LinkedIn     you
```

## What it does and doesn't do

| Works | Doesn't (yet) |
| --- | --- |
| Topic discovery (Firecrawl news + HN/Product Hunt), scored and de-duplicated | Automatic first comment (LinkedIn blocks it for apps with only "Share on LinkedIn") |
| Research + fact extraction, sourced facts only | Reading impressions/reactions from LinkedIn (needs a restricted API); you enter numbers by hand |
| 3 draft variants, humanized, linted, with an audit for invented experience | Automatic learning from results |
| Visuals: PDF carousel, image card, 15s stat video (Remotion) | |
| Publish text, image, PDF carousel, video; delete posts | |
| Scheduler with weekly cap, pause switch | |
| Write a post from the browser (topic + your take), with optional visual, running in the background | |
| "Publish now" outside the schedule, with a check screen and a required confirmation when over your limits | |
| Delete a published post from LinkedIn (from the Posts page) | |

## Setup

Requirements: Node (developed on 24), a Firecrawl key, an OpenAI key, a LinkedIn developer app with the **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect** products.

```bash
npm install
cp .env.example .env.local      # then fill it in
npm run db:push                 # creates data/app.db
```

`.env.local`:

| Variable | Notes |
| --- | --- |
| `FIRECRAWL_API_KEY`, `OPENAI_API_KEY` | required |
| `OPENAI_MODEL` | any chat model your account can use; a stronger model writes noticeably better |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI` | from your LinkedIn app; the redirect URI must be registered in the app |
| `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_PERSON_URN` | optional if you use `npm run linkedin:auth` |
| `TIMEZONE`, `MAX_POSTS_PER_WEEK` | scheduling |
| `LINKEDIN_AUTO_COMMENT` | keep `false` unless your app has the Community Management API |

Then edit the three config files to be yours:

- `config/niche.ts`: your content pillars and keywords (drives discovery)
- `config/brand.ts`: name, handle, colors on generated visuals
- `voice/samples.md`: paste 5–10 of your own posts, separated by `---`. Without it, a neutral default voice is used.

Connect LinkedIn: `npm run linkedin:auth` opens the OAuth flow and stores the token. Tokens last about 60 days; re-run it before then. Check status any time with `npm run queue -- auth`.

## Weekly workflow

```bash
# 1. find topics (saved to the DB)
npm run discover

# 2. write drafts from a saved topic (or --text "your topic" [--url ...]); --take is required
npm run write -- --topic 33 --take "what you actually think about this"

# 3. read them, edit the one you like
npm run queue -- list --status draft
npm run queue -- show 15
npm run queue -- edit 15 --file post.txt

# 4. optional visual: the AI picks, or force --kind carousel|image|video|none
npm run queue -- media 15 --kind carousel

# 5. approve = put it in the next free slot (Tue–Thu 09:00/12:30 in TIMEZONE)
npm run queue -- approve 15

# 6. keep the worker running so due posts go out
npm run worker

# 7. after publishing: paste the printed first comment on the post yourself,
#    and a day or two later log the numbers from LinkedIn
npm run queue -- posts
npm run queue -- metrics 2 --impressions 850 --reactions 24 --comments 3
npm run queue -- stats
```

Other queue commands: `reject`, `publish <id> [--dry-run]` (post now), `retry`, `delete-post <postId>`, `pause`, `resume`, `metrics-import --file metrics.csv` (header `post,impressions,reactions,comments`). Run `npm run queue` for the full list.

## Dashboard

```bash
npm run dev      # http://127.0.0.1:3000  (bound to localhost only; use `npm run build && npm run start` for a production run)
```

You can do the whole flow here; the terminal commands above still work too.

- **New post:** enter a topic (or start from a trend), your take, an optional source link and angle, pick up to three writing styles, and optionally ask for a visual (carousel, image or video) for every draft. It researches and writes in the background: you land on a progress page that survives reloads and closing the tab. Deciding on the visual later is faster, because you only render one for the draft you keep.
- **Overview:** LinkedIn connection status, a two-week publishing calendar, what needs a decision, and any job that is running.
- **Trends:** the topics from `npm run discover`, each with a "Write a post from this" button.
- **Drafts:** read and edit the text with a live preview of what the feed shows before "see more", check sources, create or redo the visual (also a background job), approve into the next free slot or a time you pick, reject or restore.
- **Publish now:** on a draft, skips the schedule and does not need the worker. A check screen comes first (below). After it goes out you get the LinkedIn link and the first-comment text to paste.
- **Posts:** enter impressions/reactions/comments, see what performs, or delete a post from LinkedIn (confirmation required; the draft comes back to your drafts and the post stops counting toward the weekly limit).

Long jobs (writing, visuals, publishing) run as separate processes started by the dashboard (`scripts/job.ts`) and report progress through the `jobs` table. Only one job of each kind runs at a time, and a job that stops reporting for 20 minutes is marked failed.

The dashboard has no login, so keep it on localhost and don't expose the port: anyone who can reach it can schedule or publish posts to your profile.

### The publish-now check

Before a manual publish the app checks and shows:

- **Blocks** (cannot publish): the draft is already published or rejected, the text is empty, or it is over LinkedIn's 3,000-character limit.
- **Needs your confirmation** (you must tick a box; the server enforces it): over your weekly limit (published + scheduled this calendar week, or the last 7 days), another post less than 20 hours ago, or publishing is paused.
- **Good to know:** outside your usual posting days/hours, the visual still has to render, the first comment must be pasted by hand.

The terminal has the same rules: `npm run queue -- publish <id>` prints them and needs `--yes` to go over your limits.

**Read drafts before approving.** The writer only uses facts scraped from real sources and never invents your experience, but drafts can run long or lean on one source. Trim them; check the sources.

## Safety

- Nothing publishes unless a draft is approved (scheduled) or you run `queue publish`.
- A draft is claimed atomically before publishing, so the worker and a manual publish can't double-post.
- If a post goes live but a later step fails, the draft stays "published" (retrying would duplicate it).
- `queue pause` stops the worker; the weekly cap defers extra posts. A manual publish ignores both, but only after an explicit confirmation.
- Secrets live in `.env.local` (gitignored). `data/` (database) and `out/` (rendered media) are gitignored too.

## Layout

```
config/       niche, brand, schedule
scripts/      discover, write, queue (CLI), job (background runner for the dashboard), linkedin-auth, media-sample
worker/       scheduler process
remotion/     video/image/carousel compositions
src/app/      web dashboard (Next.js): pages, server actions, media preview route
src/lib/      ai/ (research, writing, media planning), trends/, linkedin/, media/, db/, publish, schedule,
              queue-core (DB-only, used by the dashboard), queue (adds render/LLM steps, used by the CLI)
```

`npm run media:sample` renders one of each visual into `out/draft-0` so you can check the design after editing `config/brand.ts`.

## Known limits

- LinkedIn's Community Management API (comments, analytics) is a separate vetted product that can't be added to this app; approval isn't guaranteed. Until then, comments and metrics are manual.
- Remotion downloads a headless Chrome (~113 MB) on the first render.
- Model latency varies a lot; drafting can take under a minute or several.
- On Windows, avoid `process.exit()` in scripts (Node 24 prints a libuv assertion); the existing scripts already avoid it.
