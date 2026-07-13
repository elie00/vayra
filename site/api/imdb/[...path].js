// IMDb metadata proxy: title rating, episode ratings, parental guide severities.
//
// Replaces: https://harbor.site/api/imdb  (see harbor
//   src/lib/providers/harbor-imdb.ts, const BASE = "https://harbor.site/api/imdb").
//
// Routes and the EXACT JSON shapes the desktop app consumes:
//   GET /api/imdb/title/{tt}        -> { "rating": number | null }
//        (harborImdbTitle reads j.rating)
//   GET /api/imdb/episodes/{tt}     -> { "ratings": { "<season>:<episode>": number, ... } }
//        (harborImdbEpisodes reads j.ratings; keys are `${season}:${episode}`)
//   GET /api/imdb/parental/{tt}     -> { "categories": [ { "category": string, "severity": string }, ... ] }
//        (harborImdbParental reads j.categories[].category / .severity)
//
// Data source: IMDb's own public GraphQL endpoint (api.graphql.imdb.com), which
// requires no API key. If you front it with a paid data provider instead, set
// IMDB_API_KEY (+ optionally IMDB_API_BASE) and this proxy forwards the key as a
// Bearer token; otherwise it uses the keyless IMDb GraphQL directly.

const IMDB_GRAPHQL = "https://api.graphql.imdb.com/";

function isTt(s) {
  return typeof s === "string" && /^tt\d+$/.test(s);
}

async function imdbGraphQL(query, variables) {
  const headers = { "content-type": "application/json", accept: "application/json" };
  // Optional: some deployments proxy IMDb GraphQL behind an auth'd gateway.
  if (process.env.IMDB_API_KEY) {
    headers.authorization = `Bearer ${process.env.IMDB_API_KEY}`;
  }
  const endpoint = process.env.IMDB_API_BASE || IMDB_GRAPHQL;
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) return null;
  return res.json();
}

// --- title rating ---------------------------------------------------------
async function handleTitle(tt) {
  const q = `query R($id: ID!) { title(id: $id) { ratingsSummary { aggregateRating } } }`;
  const j = await imdbGraphQL(q, { id: tt });
  const raw =
    j && j.data && j.data.title && j.data.title.ratingsSummary
      ? j.data.title.ratingsSummary.aggregateRating
      : null;
  const v = Number(raw);
  return { rating: Number.isFinite(v) && v > 0 ? v : null };
}

// --- episode ratings ------------------------------------------------------
async function handleEpisodes(tt) {
  const q = `query E($id: ID!, $after: ID) {
    title(id: $id) {
      episodes {
        episodes(first: 250, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges { node {
            series { displayableEpisodeNumber {
              displayableSeason { text }
              episodeNumber { text }
            } }
            ratingsSummary { aggregateRating }
          } }
        }
      }
    }
  }`;
  const ratings = {};
  let after = null;
  for (let page = 0; page < 40; page += 1) {
    const j = await imdbGraphQL(q, { id: tt, after });
    const conn =
      j && j.data && j.data.title && j.data.title.episodes
        ? j.data.title.episodes.episodes
        : null;
    if (!conn) break;
    for (const edge of conn.edges || []) {
      const node = edge && edge.node;
      if (!node) continue;
      const den =
        node.series &&
        node.series.displayableEpisodeNumber;
      const season = den && den.displayableSeason && den.displayableSeason.text;
      const ep = den && den.episodeNumber && den.episodeNumber.text;
      const rating =
        node.ratingsSummary && Number(node.ratingsSummary.aggregateRating);
      const seasonNum = Number(season);
      const epNum = Number(ep);
      if (
        Number.isFinite(seasonNum) &&
        Number.isFinite(epNum) &&
        Number.isFinite(rating) &&
        rating > 0
      ) {
        ratings[`${seasonNum}:${epNum}`] = rating;
      }
    }
    if (!conn.pageInfo || !conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
    if (!after) break;
  }
  return { ratings };
}

// --- parental guide -------------------------------------------------------
async function handleParental(tt) {
  const q = `query P($id: ID!) {
    title(id: $id) {
      parentsGuide {
        categories {
          category { text }
          severity { text }
        }
      }
    }
  }`;
  const j = await imdbGraphQL(q, { id: tt });
  const cats =
    j && j.data && j.data.title && j.data.title.parentsGuide
      ? j.data.title.parentsGuide.categories
      : null;
  const categories = [];
  for (const c of cats || []) {
    const category = c && c.category && c.category.text;
    const severity = c && c.severity && c.severity.text;
    if (typeof category === "string" && typeof severity === "string") {
      categories.push({ category, severity });
    }
  }
  return { categories };
}

function routeParts(req) {
  // The path can arrive two ways: via the [...path] catch-all (req.query.path,
  // an array) or via the vercel.json rewrite (which routes here without
  // populating query.path). Parse req.url directly as the reliable fallback.
  const q = req.query && req.query.path;
  if (Array.isArray(q) && q.length) return q;
  if (typeof q === "string" && q) return q.split("/").filter(Boolean);
  const path = (req.url || "").split("?")[0].replace(/^\/api\/imdb\/?/, "");
  return path.split("/").filter(Boolean);
}

module.exports = async (req, res) => {
  const [kind, tt] = routeParts(req);

  if (!isTt(tt)) {
    res.status(400).json({ error: "invalid imdb id" });
    return;
  }

  // Cache aggressively: ratings/parental data change slowly; the app also
  // memoises per-id in-process.
  res.setHeader("Cache-Control", "public, max-age=21600, s-maxage=86400");

  try {
    if (kind === "title") {
      res.status(200).json(await handleTitle(tt));
      return;
    }
    if (kind === "episodes") {
      res.status(200).json(await handleEpisodes(tt));
      return;
    }
    if (kind === "parental") {
      res.status(200).json(await handleParental(tt));
      return;
    }
    res.status(404).json({ error: "unknown imdb route" });
  } catch {
    // Match the app's graceful-degradation expectations with empty payloads.
    if (kind === "title") res.status(200).json({ rating: null });
    else if (kind === "episodes") res.status(200).json({ ratings: {} });
    else if (kind === "parental") res.status(200).json({ categories: [] });
    else res.status(502).json({ error: "imdb upstream error" });
  }
};
