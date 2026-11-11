// Jobber (mailbox division CRM) connection: OAuth tokens + GraphQL calls.
// Server-side only. The client secret lives in Vercel env vars; the long-lived refresh token is
// stored in the "Jobber Auth" sheet tab, encrypted with a key derived from the client secret,
// so anyone who can open the Google Sheet still can't read or use it.
import crypto from "crypto";
import { ensureSheet, readRange, writeRange } from "./sheets";

const API = "https://api.getjobber.com/api";
// Jobber requires a dated API version on every call. Retired versions are auto-upgraded by Jobber
// to the oldest supported one; responses warn in extensions.versioning when this needs bumping.
export const JOBBER_API_VERSION = "2025-04-16";
const AUTH_TAB = "Jobber Auth";
const AUTH_HEADER = ["Refresh token (encrypted)", "Account", "Account ID", "Connected", "Note"];

// Each location has its own Jobber account and its own row in the "Jobber Auth" tab.
// Indianapolis keeps row 2, which is where the original single connection was saved.
export const LOCATIONS = {
  indy: { label: "Indianapolis", row: 2 },
  cincinnati: { label: "Cincinnati", row: 3 },
} as const;
export type Loc = keyof typeof LOCATIONS;
export const DEFAULT_LOC: Loc = "indy";
export function parseLoc(v: string | null | undefined): Loc {
  return v && v in LOCATIONS ? (v as Loc) : DEFAULT_LOC;
}
export const connectPath = (loc: Loc) => (loc === DEFAULT_LOC ? "/api/jobber/connect" : `/api/jobber/connect?loc=${loc}`);

export function jobberConfig() {
  const clientId = process.env.JOBBER_CLIENT_ID;
  const clientSecret = process.env.JOBBER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing JOBBER_CLIENT_ID or JOBBER_CLIENT_SECRET in Vercel settings");
  return { clientId, clientSecret };
}

export function callbackUrl(origin: string) {
  return `${origin}/api/jobber/callback`;
}

// ---------- encryption for the stored refresh token ----------
function key() {
  return crypto.createHash("sha256").update("rons-dashboard:jobber:" + jobberConfig().clientSecret).digest();
}
function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}
function decrypt(s: string) {
  const [v, iv, tag, body] = s.split(".");
  if (v !== "v1") throw new Error("Unknown token format");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]).toString("utf8");
}

// ---------- signed state for the OAuth round trip ----------
export function signState(payload: string) {
  const mac = crypto.createHmac("sha256", key()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}
export function verifyState(state: string) {
  const i = state.lastIndexOf(".");
  if (i < 0) return null;
  const payload = state.slice(0, i);
  const want = signState(payload).slice(i + 1);
  const got = state.slice(i + 1);
  if (want.length !== got.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got))) return null;
  return payload;
}

// ---------- stored connection ----------
export type StoredConnection = { refreshToken: string; account: string; accountId: string; connectedAt: string };

export async function loadConnection(loc: Loc = DEFAULT_LOC): Promise<StoredConnection | null> {
  await ensureSheet(AUTH_TAB, [AUTH_HEADER]);
  const row = LOCATIONS[loc].row;
  const rows = await readRange(`${AUTH_TAB}!A${row}:D${row}`);
  const r = rows[0];
  if (!r || !r[0]) return null;
  try {
    return { refreshToken: decrypt(r[0]), account: r[1] ?? "", accountId: r[2] ?? "", connectedAt: r[3] ?? "" };
  } catch {
    return null; // client secret changed or tab edited by hand: treat as not connected
  }
}

export async function saveConnection(c: StoredConnection, loc: Loc = DEFAULT_LOC) {
  await ensureSheet(AUTH_TAB, [AUTH_HEADER]);
  const row = LOCATIONS[loc].row;
  await writeRange(`${AUTH_TAB}!A1:E1`, [AUTH_HEADER]);
  await writeRange(`${AUTH_TAB}!A${row}:E${row}`, [
    [
      encrypt(c.refreshToken),
      c.account,
      c.accountId,
      c.connectedAt,
      `${LOCATIONS[loc].label}. Managed by the dashboard. Don't edit; reconnect at ${connectPath(loc)}`,
    ],
  ]);
}

// ---------- tokens ----------
type TokenResponse = { access_token: string; refresh_token?: string };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = jobberConfig();
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Jobber token request failed (${res.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text) as TokenResponse;
}

export function exchangeCode(code: string, redirectUri: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

// Access tokens last ~60 minutes; keep one per location in memory per server instance.
const cached = new Map<Loc, { token: string; exp: number }>();

function tokenExpiry(token: string) {
  try {
    const exp = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).exp;
    if (typeof exp === "number") return exp * 1000;
  } catch {}
  return Date.now() + 50 * 60_000;
}

async function accessToken(loc: Loc, force = false) {
  const hit = cached.get(loc);
  if (!force && hit && hit.exp - Date.now() > 2 * 60_000) return hit.token;
  const conn = await loadConnection(loc);
  if (!conn) throw new JobberNotConnected(loc);
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: conn.refreshToken });
  if (t.refresh_token && t.refresh_token !== conn.refreshToken) {
    await saveConnection({ ...conn, refreshToken: t.refresh_token }, loc); // only happens if rotation gets turned on
  }
  const fresh = { token: t.access_token, exp: tokenExpiry(t.access_token) };
  cached.set(loc, fresh);
  return fresh.token;
}

export class JobberNotConnected extends Error {
  constructor(loc: Loc = DEFAULT_LOC) {
    super(`Jobber (${LOCATIONS[loc].label}) isn't connected yet. A Jobber admin needs to open ${connectPath(loc)} once.`);
  }
}

// ---------- GraphQL ----------
export async function jobberQuery<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
  token?: string,
  loc: Loc = DEFAULT_LOC
): Promise<T> {
  let throttles = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const bearer = token ?? (await accessToken(loc, attempt > 0));
    const res = await fetch(`${API}/graphql`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        "X-JOBBER-GRAPHQL-VERSION": JOBBER_API_VERSION,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    if (res.status === 401 && !token && attempt === 0) continue; // stale access token: refresh once
    const json = await res.json().catch(() => ({}));
    // Jobber meters API use; when the budget runs low it answers THROTTLED. Wait for it to refill and retry.
    const throttled = res.status === 429 || json.errors?.some((e: { extensions?: { code?: string } }) => e.extensions?.code === "THROTTLED");
    if (throttled && throttles < 5) {
      const st = json.extensions?.cost?.throttleStatus;
      const need = Number(json.extensions?.cost?.requestedQueryCost) || 1000;
      const waitMs = st?.restoreRate ? Math.ceil(((need - (st.currentlyAvailable ?? 0)) / st.restoreRate) * 1000) + 250 : 2000 * (throttles + 1);
      await new Promise((r) => setTimeout(r, Math.min(Math.max(waitMs, 500), 8000)));
      throttles++;
      attempt--; // retry without counting it as a token refresh
      continue;
    }
    if (!res.ok || json.errors?.length) {
      throw new Error(`Jobber query failed (${res.status}): ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
    }
    return json.data as T;
  }
  throw new Error("Jobber query failed after refreshing the token");
}
