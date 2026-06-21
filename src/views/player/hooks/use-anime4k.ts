import { useEffect, type RefObject } from "react";
import type { PlayerBridge } from "@/lib/player/bridge";
import { anime4kChain, type Anime4kMode, type Anime4kTier } from "@/lib/player/anime4k-modes";
import { useSettings } from "@/lib/settings";
import type { PlayerSrc } from "@/lib/view";

export type Anime4kChoice = "auto" | "off" | Anime4kMode;

function isAnimeSrc(src: PlayerSrc): boolean {
  const id = src.meta.id ?? "";
  if (/^(kitsu|mal|anilist|anidb):/.test(id)) return true;
  return (src.meta.genres ?? []).some((g) => g.toLowerCase() === "anime");
}

export function useAnime4k(bridgeRef: RefObject<PlayerBridge | null>, srcKey: string, src: PlayerSrc) {
  const { settings, update } = useSettings();
  const choice = (settings.playerAnime4kOverride as Anime4kChoice) || "auto";
  const available = !!settings.playerAnime4kFolder;

  const shadersFor = (c: Anime4kChoice): string[] => {
    if (c === "off") return [];
    if (c === "auto") {
      const on = settings.playerAnime4k && (!settings.playerAnime4kAnimeOnly || isAnimeSrc(src));
      return on ? settings.playerAnime4kShaders : [];
    }
    return anime4kChain(settings.playerAnime4kFolder, c, settings.playerAnime4kTier as Anime4kTier);
  };

  useEffect(() => {
    bridgeRef.current?.setAnime4kShaders(shadersFor(choice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcKey]);

  const setMode = (c: string) => {
    update({ playerAnime4kOverride: c });
    bridgeRef.current?.setAnime4kShaders(shadersFor(c as Anime4kChoice));
  };

  return { mode: choice, setMode, available };
}
