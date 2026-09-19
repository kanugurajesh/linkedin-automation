import { eq } from "drizzle-orm";
import { db, linkedinAuth } from "../db";
import { getEnv } from "../env";

export interface Auth {
  token: string;
  personUrn: string;
  source: "db" | "env";
  expiresAt?: Date;
}

/** Token from the OAuth script (DB) if still valid, else the one in .env.local. */
export async function getAuth(): Promise<Auth> {
  const [row] = await db.select().from(linkedinAuth).where(eq(linkedinAuth.id, 1));
  if (row && row.expiresAt.getTime() > Date.now() + 60_000) {
    return { token: row.accessToken, personUrn: row.personUrn, source: "db", expiresAt: row.expiresAt };
  }
  const env = getEnv("LINKEDIN_ACCESS_TOKEN", "LINKEDIN_PERSON_URN");
  return { token: env.LINKEDIN_ACCESS_TOKEN, personUrn: env.LINKEDIN_PERSON_URN, source: "env" };
}

export class LinkedInError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

const BASE = "https://api.linkedin.com";

/** Versioned REST call. Returns the raw Response so callers can read headers (e.g. x-restli-id). */
export async function api(path: string, init: RequestInit & { json?: unknown } = {}): Promise<Response> {
  const [{ token }, { LINKEDIN_API_VERSION }] = [await getAuth(), getEnv("LINKEDIN_API_VERSION")];
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": LINKEDIN_API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  if (!res.ok) {
    const body = await res.text();
    const hint = res.status === 401 ? " (token expired or revoked: re-run `npm run linkedin:auth`)" : "";
    throw new LinkedInError(`LinkedIn ${init.method ?? "GET"} ${path} failed: ${res.status}${hint} ${body.slice(0, 400)}`, res.status, body);
  }
  return res;
}

/** Confirms the token works and belongs to the configured person URN. */
export async function checkAuth(): Promise<{ name: string; urn: string; source: Auth["source"]; urnMatches: boolean }> {
  const auth = await getAuth();
  const res = await fetch(`${BASE}/v2/userinfo`, { headers: { Authorization: `Bearer ${auth.token}` } });
  if (!res.ok) throw new LinkedInError(`userinfo failed: ${res.status}`, res.status, await res.text());
  const info = (await res.json()) as { sub: string; name?: string };
  return { name: info.name ?? "(unknown)", urn: auth.personUrn, source: auth.source, urnMatches: auth.personUrn === `urn:li:person:${info.sub}` };
}
