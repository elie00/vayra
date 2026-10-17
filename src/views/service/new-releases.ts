import type { Meta } from "@/lib/cinemeta";
import { safeFetch } from "@/lib/safe-fetch";

const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const MAX = 30;

const DAY_MS = 86_400_000;
const day = (d: Date) => d.toISOString().slice(0, 10);

// ---- JustWatch: what actually reached the service, day by day ----
//
// TMDB's watch providers come from JustWatch but without the date a title was
// added, so an old film newly in a catalog cannot be told apart. JustWatch's own
// API (unofficial, no key) lists each day's arrivals; TMDB stays the fallback.

const JUSTWATCH = "https://apis.justwatch.com/graphql";
const JW_IMG = "https://images.justwatch.com";
const JW_DAYS = 14;
const JW_PER_DAY = 40;

type JwContent = { title?: string; posterUrl?: string | null; originalReleaseYear?: number; externalIds?: { tmdbId?: string | null } };
type JwEdge = {
  node: { __typename: string; content?: JwContent & { seasonNumber?: number }; show?: { content?: JwContent } };
};

const NEW_TITLES = `query GetNewTitles($country: Country!, $date: Date!, $language: Language!, $filter: TitleFilter, $first: Int!, $pageType: NewPageType!, $priceDrops: Boolean!) {
  newTitles(country: $country, date: $date, filter: $filter, first: $first, pageType: $pageType, priceDrops: $priceDrops) {
    edges { node { __typename
      ... on Movie { content(country: $country, language: $language) { title posterUrl originalReleaseYear externalIds { tmdbId } } }
      ... on Season { content(country: $country, language: $language) { seasonNumber }
        show { content(country: $country, language: $language) { title posterUrl originalReleaseYear externalIds { tmdbId } } } } } }
  }
}`;

async function justWatch<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  try {
    const res = await safeFetch(JUSTWATCH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: T; errors?: unknown };
    return body.errors || !body.data ? null : body.data;
  } catch (e) {
    console.warn("[service] JustWatch request failed", e);
    return null;
  }
}

/** JustWatch's package codes in a country, by provider id (the same ids TMDB uses). */
const packageCodes = new Map<string, Map<number, string>>();

async function packagesIn(country: string): Promise<Map<number, string> | null> {
  const known = packageCodes.get(country);
  if (known) return known;
  const data = await justWatch<{ packages: { shortName: string; packageId: number }[] }>(
    `query { packages(country: ${country}, platform: WEB, includeAddons: false) { shortName packageId } }`,
  );
  if (!data) return null;
  const codes = new Map(data.packages.map((p) => [p.packageId, p.shortName]));
  packageCodes.set(country, codes);
  return codes;
}

const jwPoster = (url: string) => `${JW_IMG}${url.replace("{profile}", "s332").replace("{format}", "webp")}`;

/** Cards for JustWatch arrivals: a film, or the show a new season belongs to. */
export function justWatchMetas(edges: JwEdge[]): Meta[] {
  const metas: Meta[] = [];
  const seen = new Set<string>();
  for (const { node } of edges) {
    const isSeason = node.__typename === "Season";
    const content = isSeason ? node.show?.content : node.content;
    const tmdbId = content?.externalIds?.tmdbId;
    if (!content?.title || !content.posterUrl || !tmdbId) continue;
    const id = `tmdb:${isSeason ? "tv" : "movie"}:${tmdbId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    metas.push({
      id,
      type: isSeason ? "series" : "movie",
      name: content.title,
      poster: jwPoster(content.posterUrl),
      releaseInfo: content.originalReleaseYear ? String(content.originalReleaseYear) : undefined,
    });
  }
  return metas;
}

/** What reached the service in the last two weeks, newest first; null when JustWatch cannot say. */
async function justWatchNew(providerIds: string, region: string, language: string, now: Date): Promise<Meta[] | null> {
  const codes = await packagesIn(region);
  if (!codes) return null;
  const packages = [...new Set(providerIds.split("|").map((id) => codes.get(Number(id))).filter((c): c is string => !!c))];
  if (packages.length === 0) return null;
  const days = Array.from({ length: JW_DAYS }, (_, i) => day(new Date(now.getTime() - i * DAY_MS)));
  const perDay = await Promise.all(
    days.map((date) =>
      justWatch<{ newTitles: { edges: JwEdge[] } }>(NEW_TITLES, {
        country: region,
        language,
        date,
        filter: { packages },
        first: JW_PER_DAY,
        pageType: "NEW",
        priceDrops: false,
      }),
    ),
  );
  if (perDay.every((d) => d == null)) return null;
  return justWatchMetas(perDay.flatMap((d) => d?.newTitles.edges ?? [])).slice(0, MAX);
}

// ---- TMDB fallback: recent releases on the service ----

/** Films released and series started in the window; episodes aired lately would
 *  bring back daily shows running for decades. */
const TMDB_WINDOW_DAYS = 60;

export function newReleasesParams(
  kind: "movie" | "tv",
  key: string,
  providerIds: string,
  region: string,
  now: Date,
): URLSearchParams {
  const field = kind === "movie" ? "primary_release_date" : "first_air_date";
  return new URLSearchParams({
    api_key: key,
    with_watch_providers: providerIds,
    watch_region: region,
    with_watch_monetization_types: "flatrate|free|ads",
    [`${field}.gte`]: day(new Date(now.getTime() - TMDB_WINDOW_DAYS * DAY_MS)),
    [`${field}.lte`]: day(now),
    sort_by: "popularity.desc",
    include_adult: "false",
  });
}

type Raw = { id: number; poster_path?: string | null; backdrop_path?: string | null; overview?: string; vote_average?: number; popularity?: number; title?: string; release_date?: string; name?: string; first_air_date?: string };

function tmdbMeta(kind: "movie" | "tv", r: Raw): Meta {
  const date = kind === "movie" ? r.release_date : r.first_air_date;
  return {
    id: `tmdb:${kind}:${r.id}`,
    type: kind === "movie" ? "movie" : "series",
    name: (kind === "movie" ? r.title : r.name) ?? "",
    poster: `${IMG}/w342${r.poster_path}`,
    background: r.backdrop_path ? `${IMG}/w780${r.backdrop_path}` : undefined,
    description: r.overview,
    releaseInfo: date?.slice(0, 4),
    releaseDate: date,
    imdbRating: r.vote_average && r.vote_average > 0 ? Number(r.vote_average).toFixed(1) : undefined,
  };
}

async function discover(kind: "movie" | "tv", params: URLSearchParams): Promise<Raw[]> {
  try {
    const res = await safeFetch(`${TMDB}/discover/${kind}?${params.toString()}`);
    if (!res.ok) return [];
    return ((await res.json()).results ?? []) as Raw[];
  } catch (e) {
    console.warn("[service] new releases failed", { kind, error: e });
    return [];
  }
}

async function tmdbNew(key: string, providerIds: string, region: string, now: Date): Promise<Meta[]> {
  if (!key) return [];
  const [movies, series] = await Promise.all(
    (["movie", "tv"] as const).map(async (kind) =>
      (await discover(kind, newReleasesParams(kind, key, providerIds, region, now)))
        .filter((r) => r.poster_path)
        .map((r) => ({ meta: tmdbMeta(kind, r), popularity: r.popularity ?? 0 })),
    ),
  );
  return [...movies, ...series]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, MAX)
    .map((r) => r.meta);
}

/** A day's answer per service, region and language: a page visit costs 15 requests. */
const today = new Map<string, Meta[]>();

/** What is new on the service in the region: JustWatch's arrivals, else TMDB's releases. */
export async function fetchNewReleases(
  key: string,
  providerIds: string,
  region: string,
  language: string,
  now = new Date(),
): Promise<Meta[]> {
  const cacheKey = [day(now), providerIds, region, language].join(" ");
  const known = today.get(cacheKey);
  if (known) return known;
  const arrivals = await justWatchNew(providerIds, region, language, now);
  const metas = arrivals && arrivals.length > 0 ? arrivals : await tmdbNew(key, providerIds, region, now);
  if (metas.length > 0) today.set(cacheKey, metas);
  return metas;
}
