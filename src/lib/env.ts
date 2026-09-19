import { z } from "zod";

const schema = z.object({
  FIRECRAWL_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1),
  LINKEDIN_CLIENT_ID: z.string().min(1),
  LINKEDIN_CLIENT_SECRET: z.string().min(1),
  LINKEDIN_REDIRECT_URI: z.string().url(),
  LINKEDIN_ACCESS_TOKEN: z.string().min(1),
  LINKEDIN_PERSON_URN: z.string().regex(/^urn:li:person:.+/),
  LINKEDIN_API_VERSION: z.string().regex(/^\d{6}$/).default("202606"),
  // Commenting needs the Community Management API product, which "Share on LinkedIn" alone lacks.
  LINKEDIN_AUTO_COMMENT: z.enum(["true", "false"]).default("false"),
  DATABASE_URL: z.string().default("file:./data/app.db"),
  TIMEZONE: z.string().default("Asia/Kolkata"),
  MAX_POSTS_PER_WEEK: z.coerce.number().int().positive().default(4),
});

export type Env = z.infer<typeof schema>;

/**
 * Validated lazily per group so scripts only need the keys they use
 * (e.g. discovery does not require LinkedIn credentials).
 */
export function getEnv<K extends keyof Env>(...keys: K[]): Pick<Env, K> {
  const partial = schema.pick(Object.fromEntries(keys.map((k) => [k, true])) as never);
  const parsed = (partial as z.ZodObject).safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid env vars: ${missing}. See .env.example`);
  }
  return parsed.data as Pick<Env, K>;
}
