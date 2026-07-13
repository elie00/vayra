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
  if (!process.env.TVDB_API_KEY) {
    res.status(501).json({ error: "not configured", needs: "TVDB_API_KEY" });
    return;
  }

  const token = await getTvdbToken();
  if (!token) {
    res.status(502).json({ error: "tvdb login failed" });
    return;
  }

  const q = req.query || {};
  let seriesId = q.series ? Number(q.series) : null;
  if ((!seriesId || !Number.isFinite(seriesId)) && q.imdb) {
    seriesId = await seriesIdFromImdb(String(q.imdb));
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
