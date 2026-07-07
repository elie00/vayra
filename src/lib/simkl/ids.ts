import { anidbToMal, anilistToMal, kitsuToMal } from "@/lib/providers/anime-mapping";
import type { SimklTarget } from "./types";

export type IdResolution =
  | { ok: true; target: SimklTarget }
  | { ok: false; reason: "anime" | "unrecognized" };

async function animeIdToMal(harborId: string): Promise<number | null> {
  const n = Number(harborId.split(":")[1]);
  if (!Number.isFinite(n)) return null;
  if (harborId.startsWith("kitsu:")) return kitsuToMal(n).catch(() => null);
  if (harborId.startsWith("anilist:")) return anilistToMal(n).catch(() => null);
  if (harborId.startsWith("anidb:")) return anidbToMal(n).catch(() => null);
  return null;
}

export async function resolveSimklTarget(
  harborId: string,
  type: "movie" | "series",
): Promise<SimklTarget | null> {
  let tgt: SimklTarget | null = null;
  const resolution = stremioIdToSimklTarget(harborId);
  if (resolution.ok) {
    tgt = resolution.target;
  } else {
    const mal = await animeIdToMal(harborId);
    if (mal != null) tgt = { kind: "show", ids: { mal } };
  }
  if (!tgt) return null;
  if (type === "series" && tgt.kind === "movie") tgt = { kind: "show", ids: tgt.ids };
  if (type === "movie" && tgt.kind === "show") tgt = { kind: "movie", ids: tgt.ids };
  return tgt;
}

export function stremioIdToSimklTarget(
  metaId: string,
  episode?: { season: number; episode: number },
): IdResolution {
  if (!metaId) return { ok: false, reason: "unrecognized" };

  if (metaId.startsWith("mal:")) {
    const parts = metaId.split(":");
    const malId = Number(parts[1]);
    if (!Number.isFinite(malId)) return { ok: false, reason: "unrecognized" };

    if (parts.length >= 3) {
      const episodeNum = Number(parts[2]);
      if (Number.isFinite(episodeNum)) {
        return {
          ok: true,
          target: {
            kind: "anime-episode",
            anime: { ids: { mal: malId } },
            season: 1,
            number: episodeNum,
          },
        };
      }
    }

    if (episode) {
      return {
        ok: true,
        target: {
          kind: "anime-episode",
          anime: { ids: { mal: malId } },
          season: episode.season,
          number: episode.episode,
        },
      };
    }

    return { ok: true, target: { kind: "anime", ids: { mal: malId } } };
  }

  if (metaId.startsWith("kitsu:")) {
    const parts = metaId.split(":");
    const kitsuId = Number(parts[1]);
    if (!Number.isFinite(kitsuId)) return { ok: false, reason: "unrecognized" };

    if (parts.length >= 3) {
      const episodeNum = Number(parts[2]);
      if (Number.isFinite(episodeNum)) {
        return {
          ok: true,
          target: {
            kind: "anime-episode",
            anime: { ids: { kitsu: kitsuId } },
            season: 1,
            number: episodeNum,
          },
        };
      }
    }

    if (episode) {
      return {
        ok: true,
        target: {
          kind: "anime-episode",
          anime: { ids: { kitsu: kitsuId } },
          season: episode.season,
          number: episode.episode,
        },
      };
    }

    return { ok: true, target: { kind: "anime", ids: { kitsu: kitsuId } } };
  }

  if (metaId.startsWith("tt")) {
    const parts = metaId.split(":");
    const imdb = parts[0];
    if (!/^tt\d+$/.test(imdb)) return { ok: false, reason: "unrecognized" };

    if (parts.length >= 3) {
      const season = Number(parts[1]);
      const number = Number(parts[2]);
      if (!Number.isFinite(season) || !Number.isFinite(number)) {
        return { ok: false, reason: "unrecognized" };
      }
      return {
        ok: true,
        target: { kind: "episode", show: { ids: { imdb } }, season, number },
      };
    }

    if (episode) {
      return {
        ok: true,
        target: {
          kind: "episode",
          show: { ids: { imdb } },
          season: episode.season,
          number: episode.episode,
        },
      };
    }

    return { ok: true, target: { kind: "movie", ids: { imdb } } };
  }

  if (metaId.startsWith("tmdb:")) {
    const parts = metaId.split(":");
    const kind = parts[1];
    const id = Number(parts[2]);
    if (!Number.isFinite(id)) return { ok: false, reason: "unrecognized" };

    if (kind === "movie") {
      return { ok: true, target: { kind: "movie", ids: { tmdb: id } } };
    }
    if (kind === "tv") {
      if (parts.length >= 5) {
        const season = Number(parts[3]);
        const number = Number(parts[4]);
        if (Number.isFinite(season) && Number.isFinite(number)) {
          return {
            ok: true,
            target: { kind: "episode", show: { ids: { tmdb: id } }, season, number },
          };
        }
      }
      if (episode) {
        return {
          ok: true,
          target: {
            kind: "episode",
            show: { ids: { tmdb: id } },
            season: episode.season,
            number: episode.episode,
          },
        };
      }
      return { ok: true, target: { kind: "show", ids: { tmdb: id } } };
    }
    return { ok: false, reason: "unrecognized" };
  }

  return { ok: false, reason: "unrecognized" };
}
