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

const { TVDB_BASE, getTvdbToken } = require("../../_lib/tvdb.js");

module.exports = async (req, res) => {
  if (!process.env.TVDB_API_KEY) {
    res.status(501).json({ error: "not configured", needs: "TVDB_API_KEY" });
    return;
  }

  // Reconstruct the upstream path + query. Segments arrive via the [...path]
  // catch-all (req.query.path) or, when routed through the vercel.json rewrite,
  // only in req.url — so fall back to parsing the URL.
  const q = req.query && req.query.path;
  let segments = Array.isArray(q) ? q : q ? [q] : [];
  if (!segments.length) {
    const rawPath = (req.url || "").split("?")[0].replace(/^\/api\/tvdb\/v4\/?/, "");
    segments = rawPath.split("/").filter(Boolean).map(decodeURIComponent);
  }
  const pathPart = segments.map(encodeURIComponent).join("/");
  const qIndex = req.url.indexOf("?");
  const search = qIndex >= 0 ? req.url.slice(qIndex) : "";
  const upstream = `${TVDB_BASE}/${pathPart}${search}`;

  const token = await getTvdbToken();
  if (!token) {
    res.status(502).json({ error: "tvdb login failed" });
    return;
  }

  try {
    const upstreamRes = await fetch(upstream, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
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
