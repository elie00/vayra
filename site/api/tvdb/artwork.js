// Series artwork proxy (backgrounds / clear logos / posters).
//
// Replaces: https://harbor.site/api/tvdb/artwork  (see harbor
//   src/lib/providers/tvdb-proxy.ts, const ART_PROXY = ".../api/tvdb/artwork").
//
// Request (GET query params, built by fetchTvdbArtwork):
//   series=<tvdbSeriesId>   (preferred) OR imdb=tt1234567
//
// Response shape the app consumes (fetchTvdbArtwork reads these three arrays):
//   { "backgrounds": [url...], "clearLogos": [url...], "posters": [url...] }
//
// TVDB v4 artwork "type" ids for series:
//   2 = poster, 3 = background (fanart), 23 = clearlogo.
// We pull /series/{id}/artworks and bucket by type, ordered by TVDB score
// (highest first) so the app's `[0]` picks the best artwork.

import { getTvdbToken, tvdbGet, tvdbImg, seriesIdFromImdb } from "../_lib/tvdb.js";
import { enforceRateLimit } from "../_lib/public-request.js";

const TYPE_POSTER = 2;
const TYPE_BACKGROUND = 3;
const TYPE_CLEARLOGO = 23;

function collect(artworks, typeId) {
  return artworks
    .filter((a) => Number(a.type) === typeId)
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .map((a) => tvdbImg(a.image))
    .filter(Boolean);
}

export default async (req, res) => {
  const empty = { backgrounds: [], clearLogos: [], posters: [] };

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (!process.env.TVDB_API_KEY) {
    res.status(501).json({ error: "not configured", needs: "TVDB_API_KEY" });
    return;
  }
  if (!enforceRateLimit(req, res, { scope: "tvdb-artwork", limit: 300, windowMs: 10 * 60_000 })) {
    return;
  }

  const q = req.query || {};
  const seriesParam = typeof q.series === "string" && /^\d{1,10}$/.test(q.series) ? q.series : null;
  const imdbParam = typeof q.imdb === "string" && /^tt\d{1,12}$/.test(q.imdb) ? q.imdb : null;
  if (!seriesParam && !imdbParam) {
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    res.status(200).json(empty);
    return;
  }

  const token = await getTvdbToken();
  if (!token) {
    res.status(502).json({ error: "tvdb login failed" });
    return;
  }

  let seriesId = seriesParam ? Number(seriesParam) : null;
  if (!seriesId && imdbParam) {
    seriesId = await seriesIdFromImdb(imdbParam);
  }
  if (!seriesId || !Number.isFinite(seriesId) || seriesId <= 0) {
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    res.status(200).json(empty);
    return;
  }

  const j = await tvdbGet(`/series/${seriesId}/artworks`);
  const artworks =
    j && j.data && Array.isArray(j.data.artworks) ? j.data.artworks : [];

  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  res.status(200).json({
    backgrounds: collect(artworks, TYPE_BACKGROUND),
    clearLogos: collect(artworks, TYPE_CLEARLOGO),
    posters: collect(artworks, TYPE_POSTER),
  });
};
