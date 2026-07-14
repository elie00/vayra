import type { Meta } from "@/lib/cinemeta";
import { readLocalLibrary } from "@/lib/local-library";
import { localPlayerSrc } from "@/lib/local-library/player-src";
import type { PlayEpisode, PlayerSrc } from "@/lib/view";

export type LumaPlayableItem = {
  meta: Meta;
  episode?: PlayEpisode;
};

export type LumaPlaybackTarget =
  | { kind: "picker"; meta: Meta; episode?: PlayEpisode }
  | { kind: "player"; src: PlayerSrc };

export type LumaPlaybackResolution =
  | { ok: true; target: LumaPlaybackTarget }
  | { ok: false; message: string };

export function resolveLumaPlaybackTarget(item: LumaPlayableItem): LumaPlaybackResolution {
  if (!item.meta.id.startsWith("local:")) {
    return { ok: true, target: { kind: "picker", meta: item.meta, episode: item.episode } };
  }
  const entryId = item.meta.id.slice("local:".length);
  const entry = readLocalLibrary().find((candidate) => candidate.id === entryId);
  if (!entry) return { ok: false, message: "This local file is no longer in your library." };
  return { ok: true, target: { kind: "player", src: localPlayerSrc(entry) } };
}

