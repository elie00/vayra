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

const { getTvdbToken, tvdbGet, tvdbImg, seriesIdFromImdb } = require("../_lib/tvdb.js");

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

module.exports = async (req, res) => {
  const empty = { backgrounds: [], clearLogos: [], posters: [] };

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
