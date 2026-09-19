/**
 * One-time (and every ~60 days) OAuth flow. Starts a local server on the redirect URI,
 * prints the authorize URL, exchanges the code, and stores the token in the DB.
 */
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { db, linkedinAuth } from "../src/lib/db";
import { getEnv } from "../src/lib/env";

const env = getEnv("LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "LINKEDIN_REDIRECT_URI");
const redirect = new URL(env.LINKEDIN_REDIRECT_URI);
const state = randomBytes(16).toString("hex");
const scope = "openid profile w_member_social";

const authorizeUrl =
  "https://www.linkedin.com/oauth/v2/authorization?" +
  new URLSearchParams({ response_type: "code", client_id: env.LINKEDIN_CLIENT_ID, redirect_uri: env.LINKEDIN_REDIRECT_URI, state, scope });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", redirect.origin);
  if (url.pathname !== redirect.pathname) {
    res.writeHead(404).end();
    return;
  }
  try {
    if (url.searchParams.get("state") !== state) throw new Error("state mismatch");
    const code = url.searchParams.get("code");
    if (!code) throw new Error(url.searchParams.get("error_description") ?? "no code returned");

    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: env.LINKEDIN_REDIRECT_URI,
        client_id: env.LINKEDIN_CLIENT_ID,
        client_secret: env.LINKEDIN_CLIENT_SECRET,
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
    const tok = (await tokenRes.json()) as { access_token: string; expires_in: number };

    const info = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } });
    if (!info.ok) throw new Error(`userinfo failed: ${info.status} (was the openid scope granted?)`);
    const { sub, name } = (await info.json()) as { sub: string; name?: string };

    const row = { id: 1, accessToken: tok.access_token, personUrn: `urn:li:person:${sub}`, expiresAt: new Date(Date.now() + tok.expires_in * 1000) };
    await db.insert(linkedinAuth).values(row).onConflictDoUpdate({ target: linkedinAuth.id, set: row });

    res.writeHead(200, { "Content-Type": "text/plain" }).end("LinkedIn connected. You can close this tab.");
    console.log(`Connected as ${name ?? sub}. Token expires ${row.expiresAt.toISOString()}. Re-run this before then.`);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain" }).end(String(e));
    console.error("Auth failed:", e);
  } finally {
    server.close();
  }
});

server.listen(Number(redirect.port || 80), () => {
  console.log(`Open this URL in your browser and approve access:\n\n${authorizeUrl}\n\nWaiting on ${env.LINKEDIN_REDIRECT_URI} ...`);
});
