import type { Meta } from "@/lib/cinemeta";
import { readLocalLibrary, type LocalEntry } from "@/lib/local-library";
import { localPlayerSrc } from "@/lib/local-library/player-src";
import type { PlayEpisode, PlayerSrc } from "@/lib/view";
import type { LumaResumeEntry } from "./types";

export type LumaResumeTarget =
  | { kind: "catalog"; meta: Meta; episode?: PlayEpisode }
  | { kind: "local"; player: PlayerSrc }
  | { kind: "missing-local"; entryId: string };

export function lumaResumeMeta(entry: LumaResumeEntry): Meta {
  return {
    id: entry.ref.kind === "catalog" ? entry.ref.metaId : `local:${entry.ref.entryId}`,
    type: entry.ref.mediaType,
    name: entry.presentation.title,
    poster: entry.presentation.artwork,
    background: entry.presentation.artwork,
  };
}

export function lumaResumeEpisode(entry: LumaResumeEntry): PlayEpisode | undefined {
  const episode = entry.ref.episode;
  if (!episode) return undefined;
  return {
    season: episode.season,
    episode: episode.episode,
    videoId: episode.canonicalVideoId,
    name: entry.presentation.episodeTitle,
  };
}

export function resolveLumaResumeTarget(
  entry: LumaResumeEntry,
  localEntries: LocalEntry[] = readLocalLibrary(),
): LumaResumeTarget {
  if (entry.ref.kind === "catalog") {
    return { kind: "catalog", meta: lumaResumeMeta(entry), episode: lumaResumeEpisode(entry) };
  }
  const entryId = entry.ref.entryId;
  const local = localEntries.find((item) => item.id === entryId);
  return local
    ? { kind: "local", player: localPlayerSrc(local) }
    : { kind: "missing-local", entryId };
}
