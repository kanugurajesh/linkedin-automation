import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

export const topics = sqliteTable("topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  url: text("url"),
  source: text("source").notNull(), // hn | reddit | producthunt | news | manual
  pillar: text("pillar"),
  score: real("score").notNull().default(0),
  signals: text("signals", { mode: "json" }).$type<Record<string, number>>(),
  angles: text("angles", { mode: "json" }).$type<string[]>(),
  status: text("status").notNull().default("new"), // new | used | dismissed
  createdAt: createdAt(),
});

export const drafts = sqliteTable("drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topicId: integer("topic_id").references(() => topics.id),
  batchId: text("batch_id").notNull(), // groups variants of one generation
  format: text("format").notNull(), // story | contrarian | listicle | analysis | howto
  hook: text("hook").notNull(),
  body: text("body").notNull(),
  firstComment: text("first_comment"), // source links go here, not in the body
  personalTake: text("personal_take"),
  facts: text("facts", { mode: "json" }).$type<{ claim: string; sourceUrl: string }[]>(),
  mediaKind: text("media_kind"), // none | carousel | video | image
  mediaSpec: text("media_spec", { mode: "json" }).$type<unknown>(),
  mediaPath: text("media_path"),
  status: text("status").notNull().default("draft"),
  // draft | approved | scheduled | published | rejected | failed
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  error: text("error"),
  createdAt: createdAt(),
});

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  draftId: integer("draft_id")
    .notNull()
    .references(() => drafts.id),
  linkedinUrn: text("linkedin_urn").notNull(),
  publishedAt: integer("published_at", { mode: "timestamp" }).notNull(),
  impressions: integer("impressions"),
  reactions: integer("reactions"),
  comments: integer("comments"),
});

export const scrapeCache = sqliteTable("scrape_cache", {
  url: text("url").primaryKey(),
  markdown: text("markdown").notNull(),
  title: text("title"),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
});

export const linkedinAuth = sqliteTable("linkedin_auth", {
  id: integer("id").primaryKey(),
  accessToken: text("access_token").notNull(),
  personUrn: text("person_urn").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});
