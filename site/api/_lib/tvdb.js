// Shared TVDB v4 helpers (NOT an endpoint — filename prefixed with "_" so Vercel
// does not expose it as a route). Handles login + token caching and building
// artwork URLs, mirroring what harbor.site/api/tvdb/* did server-side.

const TVDB_BASE = "https://api4.thetvdb.com/v4";
const ARTWORKS_BASE = "https://artworks.thetvdb.com";

// Module-level token cache. Persists across invocations while the serverless
// instance stays warm; a cold start simply re-logs in. TVDB tokens last ~1 month;
// we refresh well before that.
let cachedToken = null; // { token: string, t: number }
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

// Surfaces the reason a login failed so callers can return a useful 502
// (e.g. bad key vs. a user-supported key that needs a PIN).
const tvdbState = { lastLoginError: null };

/**
 * Log in to TVDB and return a bearer token, or null if the API key is missing
 * or login fails.
 */
async function getTvdbToken() {
  const apiKey = process.env.TVDB_API_KEY;
  if (!apiKey) return null;
  if (cachedToken && Date.now() - cachedToken.t < TOKEN_TTL_MS) {
    return cachedToken.token;
  }
  // User-supported (subscriber) keys must also send a PIN. Project keys omit it.
  const pin = process.env.TVDB_PIN;
  const body = pin ? { apikey: apiKey, pin } : { apikey: apiKey };
  try {
    const res = await fetch(`${TVDB_BASE}/login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = (await res.text().catch(() => "")).slice(0, 200);
      tvdbState.lastLoginError = `login HTTP ${res.status}${pin ? " (with PIN)" : " (no PIN)"}: ${txt}`;
      return null;
    }
    const j = await res.json();
    const token = j && j.data && j.data.token;
    if (!token) {
      tvdbState.lastLoginError = "login ok but no token in response";
      return null;
    }
    tvdbState.lastLoginError = null;
    cachedToken = { token, t: Date.now() };
    return token;
  } catch (e) {
    tvdbState.lastLoginError = `login threw: ${e && e.message}`;
    return null;
  }
}

/** Fetch a TVDB v4 path (e.g. "/series/123/extended") and return parsed JSON, or null. */
async function tvdbGet(path) {
  const token = await getTvdbToken();
  if (!token) return null;
  try {
    const res = await fetch(`${TVDB_BASE}${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Normalise a TVDB image reference to an absolute URL. */
function tvdbImg(v) {
  if (typeof v !== "string" || !v) return undefined;
  if (v.startsWith("http")) return v;
  return `${ARTWORKS_BASE}${v.startsWith("/") ? "" : "/"}${v}`;
}

/** Resolve an IMDb id (ttNNNN) to a TVDB series id via /search/remoteid. */
async function seriesIdFromImdb(imdb) {
  if (!imdb || !imdb.startsWith("tt")) return null;
  const j = await tvdbGet(`/search/remoteid/${encodeURIComponent(imdb)}`);
  const data = j && Array.isArray(j.data) ? j.data : null;
  if (!data) return null;
  const hit =
    data.find((h) => h && h.series && h.series.id != null) ??
    data.find((h) => h && h.type === "series") ??
    data[0];
  const raw = hit && (hit.series ? hit.series.id : undefined);
  const id = Number(raw != null ? raw : hit && hit.tvdb_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export {
  TVDB_BASE,
  ARTWORKS_BASE,
  getTvdbToken,
  tvdbGet,
  tvdbImg,
  seriesIdFromImdb,
  tvdbState,
};
