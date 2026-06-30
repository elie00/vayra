import { hydrateTraktItems } from "@/lib/trakt/hydrate";
import type { TraktItem } from "@/lib/trakt/types";
import type { Meta } from "@/lib/cinemeta";
import { externalToKitsu } from "@/lib/providers/anime-mapping";
import { kitsuAnime } from "@/lib/providers/kitsu";
import type { HomeRow } from "@/views/home/home-types";
import { fetchWatchingItems, fetchWatchlist } from "./watchlist";
import type { SimklItem } from "./types";

const PER_RAIL = 24;

function toHydratable(items: SimklItem[]): TraktItem[] {
  return items.map((it) => ({
    type: it.type,
    title: it.title,
    year: it.year,
    ids: {
      imdb: it.ids.imdb,
      tmdb: typeof it.ids.tmdb === "number" ? it.ids.tmdb : undefined,
    },
  }));
}

function isAnimeItem(it: SimklItem): boolean {
  return it.ids.mal != null || it.ids.anidb != null;
}

async function hydrateSimklAnime(it: SimklItem): Promise<Meta | null> {
  const source = it.ids.mal != null ? "myanimelist" : "anidb";
  const ext = it.ids.mal ?? it.ids.anidb;
  if (ext == null) return null;
  const kitsuId = await externalToKitsu(source, ext).catch(() => null);
  if (kitsuId == null) return null;
  const d = await kitsuAnime(kitsuId).catch(() => null);
  if (!d || !d.poster) return null;
  return {
    id: `kitsu:${d.id}`,
    type: d.subtype === "movie" ? "movie" : "series",
    name: d.title,
    poster: d.poster,
    background: d.backdrop,
    description: d.synopsis,
    releaseInfo: d.year,
    imdbRating: d.rating,
  };
}

async function hydrateSimklItems(items: SimklItem[], tmdbKey: string): Promise<Meta[]> {
  const metas = await Promise.all(
    items.map((it) =>
      isAnimeItem(it)
        ? hydrateSimklAnime(it).catch(() => null)
        : hydrateTraktItems(toHydratable([it]), tmdbKey)
            .then((r) => r[0] ?? null)
            .catch(() => null),
    ),
  );
  return metas.filter((m): m is Meta => !!m && !!m.poster);
}

export async function buildSimklHomeRows(tmdbKey: string): Promise<HomeRow[]> {
  const [plan, watching] = await Promise.all([
    fetchWatchlist().catch(() => []),
    fetchWatchingItems().catch(() => []),
  ]);
  const [planMetas, watchMetas] = await Promise.all([
    hydrateSimklItems(plan.slice(0, PER_RAIL), tmdbKey),
    hydrateSimklItems(watching.slice(0, PER_RAIL), tmdbKey),
  ]);

  const rows: HomeRow[] = [];
  if (watchMetas.length >= 4) {
    rows.push({
      key: "simkl-watching",
      type: watching[0]?.type === "show" ? "series" : "movie",
      name: "Watching on Simkl",
      metas: watchMetas,
      page: 1,
      hasMore: false,
      noDedup: true,
    });
  }
  if (planMetas.length >= 4) {
    rows.push({
      key: "simkl-plantowatch",
      type: plan[0]?.type === "show" ? "series" : "movie",
      name: "Your Simkl Plan to Watch",
      metas: planMetas,
      page: 1,
      hasMore: false,
      noDedup: true,
    });
  }
  return rows;
}
