import type { Meta } from "./cinemeta";
import { tmdbMetadataOverview } from "./providers/tmdb/tmdb-lite";

/** Resolve only stable catalog IDs; never guess a translation from a title search. */
export async function localizedMetadataOverview(key: string, meta: Meta, language: string): Promise<string | undefined> {
  if (!key) return undefined;
  let id = meta.id;
  const anime = id.match(/^(kitsu|mal|anilist|anidb):(\d+)$/);
  if (anime) {
    const { externalToKitsu, kitsuToImdb } = await import("./providers/anime-mapping");
    const source = anime[1] === "mal" ? "myanimelist" : anime[1];
    const kitsuId = source === "kitsu" ? Number(anime[2]) : await externalToKitsu(source, Number(anime[2]));
    if (kitsuId == null) return undefined;
    const imdb = await kitsuToImdb(kitsuId);
    if (!imdb) return undefined;
    id = imdb;
  }
  return tmdbMetadataOverview(key, id, meta.type, language);
}
