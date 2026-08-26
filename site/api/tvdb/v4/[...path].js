// Pass-through proxy for the TVDB v4 API.
//
// Replaces: https://harbor.site/api/tvdb/v4  (see harbor src/lib/providers/tvdb.ts,
//   const PROXY_V4 = "https://harbor.site/api/tvdb/v4").
//
// The desktop app hits `${PROXY_V4}${path}` with `path` like
//   /search/remoteid/tt1234567
//   /series/123/extended?meta=translations&short=false
//   /series/123/episodes/default?season=2
// and reads the `data` field of the returned JSON. We attach the server-side
// bearer token (obtained via TVDB login with TVDB_API_KEY) and forward the TVDB
// response body verbatim so `j.data` matches exactly.

import { TVDB_BASE, getTvdbToken } from "../../_lib/tvdb.js";
import { enforceRateLimit } from "../../_lib/public-request.js";

const ALLOWED_EPISODE_ORDERS = new Set(["default", "dvd", "absolute", "alternate", "regional"]);

function isAllowedRoute(segments) {
  if (
    segments.length === 3 &&
    segments[0] === "search" &&
    segments[1] === "remoteid"
  ) {
    return /^[0-9A-Za-z_.:-]{1,128}$/.test(segments[2]);
  }
  if (segments[0] !== "series" || !/^\d{1,10}$/.test(segments[1] || "")) return false;
  if (segments.length === 3 && segments[2] === "extended") return true;
  return (
    (segments.length === 4 || segments.length === 5) &&
    segments[2] === "episodes" &&
    ALLOWED_EPISODE_ORDERS.has(segments[3]) &&
    (segments.length === 4 || /^[a-z]{3}$/.test(segments[4]))
  );
}

function allowedSearch(rawUrl) {
  const input = new URL(rawUrl || "/", "https://vayra.invalid").searchParams;
  const output = new URLSearchParams();
  const short = input.get("short");
  const meta = input.get("meta");
  const season = input.get("season");
  const page = input.get("page");
  if (short === "true" || short === "false") output.set("short", short);
  if (meta === "translations") output.set("meta", meta);
  if (/^\d{1,3}$/.test(season || "")) output.set("season", season);
  if (/^\d{1,2}$/.test(page || "") && Number(page) < 40) output.set("page", page);
  const value = output.toString();
  return value ? `?${value}` : "";
}

export default async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (!process.env.TVDB_API_KEY) {
    res.status(501).json({ error: "not configured", needs: "TVDB_API_KEY" });
    return;
  }
  if (!enforceRateLimit(req, res, { scope: "tvdb-v4", limit: 600, windowMs: 10 * 60_000 })) {
    return;
  }

  // Reconstruct the upstream path + query. Segments arrive via the [...path]
  // catch-all (req.query.path) or, when routed through the vercel.json rewrite,
  // only in req.url — so fall back to parsing the URL.
  const q = req.query && req.query.path;
  let segments = Array.isArray(q) ? q : q ? [q] : [];
  if (!segments.length) {
    const rawPath = (req.url || "").split("?")[0].replace(/^\/api\/tvdb\/v4\/?/, "");
    try {
      segments = rawPath.split("/").filter(Boolean).map(decodeURIComponent);
    } catch {
      res.status(400).json({ error: "invalid tvdb path" });
      return;
    }
  }
  if (!isAllowedRoute(segments)) {
    res.status(404).json({ error: "unsupported tvdb route" });
    return;
  }
  const pathPart = segments.map(encodeURIComponent).join("/");
  const search = allowedSearch(req.url);
  const upstream = `${TVDB_BASE}/${pathPart}${search}`;

  const token = await getTvdbToken();
  if (!token) {
    res.status(502).json({ error: "tvdb login failed" });
    return;
  }

  try {
    const upstreamRes = await fetch(upstream, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    const body = await upstreamRes.text();
    // Short cache: TVDB metadata changes rarely; the app also caches in-memory.
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    res.setHeader(
      "Content-Type",
      upstreamRes.headers.get("content-type") || "application/json",
    );
    res.status(upstreamRes.status).send(body);
  } catch {
    res.status(502).json({ error: "tvdb upstream error" });
  }
};
