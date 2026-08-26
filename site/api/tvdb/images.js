// Episode-still image map proxy.
//
// Replaces: https://harbor.site/api/tvdb/images  (see harbor
//   src/lib/providers/tvdb-proxy.ts, const PROXY = ".../api/tvdb/images").
//
// Request (GET query params, built by fetchTvdbProxyImages):
//   series=<tvdbSeriesId>            (preferred) OR imdb=tt1234567
//   type=default|dvd|absolute|...    ("default" when the app order is "aired")
//
// Response shape the app consumes ( `j.images` ):
//   { "images": { "absN": "<url>", "sSeEp": "<url>", ... } }
// Keys are read by pickTvdbImage:  `abs${absoluteNumber}`, `s${season}e${ep}`.
// We build the map from TVDB v4 episodes for the requested order, attaching the
// absolute-number key when present and the season/episode key always.

import { getTvdbToken, tvdbGet, tvdbImg, seriesIdFromImdb } from "../_lib/tvdb.js";
import { enforceRateLimit } from "../_lib/public-request.js";

const ORDER_SLUG = {
  aired: "default",
  default: "default",
  dvd: "dvd",
  absolute: "absolute",
  tvdbabsolute: "absolute",
  alternate: "alternate",
  regional: "regional",
};

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
  if (!enforceRateLimit(req, res, { scope: "tvdb-images", limit: 300, windowMs: 10 * 60_000 })) {
    return;
  }

  const q = req.query || {};
  const seriesParam = typeof q.series === "string" && /^\d{1,10}$/.test(q.series) ? q.series : null;
  const imdbParam = typeof q.imdb === "string" && /^tt\d{1,12}$/.test(q.imdb) ? q.imdb : null;
  if (!seriesParam && !imdbParam) {
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    res.status(200).json({ images: {} });
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
    res.status(200).json({ images: {} });
    return;
  }

  const typeParam = typeof q.type === "string" ? q.type : "default";
  const slug = ORDER_SLUG[typeParam] || "default";

  const images = {};
  // TVDB paginates episodes (500/page); walk pages until short/empty.
  for (let page = 0; page < 20; page += 1) {
    const j = await tvdbGet(`/series/${seriesId}/episodes/${slug}?page=${page}`);
    const arr = j && j.data && Array.isArray(j.data.episodes) ? j.data.episodes : [];
    if (arr.length === 0) break;
    for (const e of arr) {
      const url = tvdbImg(e.image);
      if (!url) continue;
      if (typeof e.absoluteNumber === "number" && e.absoluteNumber > 0) {
        images[`abs${e.absoluteNumber}`] = url;
      }
      if (typeof e.seasonNumber === "number" && typeof e.number === "number") {
        images[`s${e.seasonNumber}e${e.number}`] = url;
      }
    }
    if (arr.length < 500) break;
  }

  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  res.status(200).json({ images });
};
