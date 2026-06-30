import { useEffect, useRef, useState } from "react";
import { fetchAdjacentEpisodes } from "@/lib/series-episodes";
import type { Meta } from "@/lib/cinemeta";
import { episodeFromVideoId, libraryMetaType, type LibraryItem } from "@/lib/stremio";
import { isNextAired, resurfaceCandidates, type AnimeMode } from "@/lib/cw-resurface";

const FINISHED_RATIO = 0.9;

function isFinishedSeries(i: LibraryItem): boolean {
  if (i.type !== "series" || !i.state) return false;
  if ((i.state.flaggedWatched ?? 0) <= 0) return false;
  const dur = i.state.duration ?? 0;
  const off = i.state.timeOffset ?? 0;
  return dur <= 0 || off / dur >= FINISHED_RATIO;
}

function currentEpisode(i: LibraryItem): { season: number; episode: number } | null {
  const season = i.state?.season;
  const episode = i.state?.episode;
  if (season && episode) return { season, episode };
  const vid = i.state?.video_id ?? "";
  if (/^(kitsu|mal|anilist|anidb):/.test(i._id) && vid.split(":").length === 3) return null;
  return episodeFromVideoId(vid);
}

function sameMap(a: Map<string, LibraryItem>, b: Map<string, LibraryItem>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

export function useCwAdvance(
  items: LibraryItem[],
  tmdbKey: string,
  enabled: boolean,
  library?: LibraryItem[],
  animeMode: AnimeMode = "all",
): LibraryItem[] {
  const [advanced, setAdvanced] = useState<Map<string, LibraryItem>>(new Map());
  const [extra, setExtra] = useState<LibraryItem[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const cacheRef = useRef<Map<string, { season: number; episode: number; airDate?: string } | null>>(
    new Map(),
  );

  useEffect(() => {
    if (!enabled) {
      setAdvanced((prev) => (prev.size === 0 ? prev : new Map()));
      setExtra((prev) => (prev.length === 0 ? prev : []));
      setRemoved((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    let cancelled = false;
    const targets = items.filter((i) => currentEpisode(i) && isFinishedSeries(i));
    void (async () => {
      const next = new Map<string, LibraryItem>();
      const remove = new Set<string>();
      for (const i of targets) {
        const cur = currentEpisode(i)!;
        const key = `${i._id}:${cur.season}:${cur.episode}`;
        let nx = cacheRef.current.get(key);
        let fetchOk = nx !== undefined;
        if (nx === undefined) {
          const meta: Meta = {
            id: i._id,
            type: libraryMetaType(i.type),
            name: i.name,
            poster: i.poster,
            background: i.background,
          };
          const adj = await fetchAdjacentEpisodes(meta, cur, { tmdbKey })
            .then((a) => ({ ok: true, next: a.next }))
            .catch(() => ({ ok: false, next: null }));
          if (cancelled) return;
          fetchOk = adj.ok;
          if (adj.ok) {
            nx = adj.next
              ? { season: adj.next.season, episode: adj.next.episode, airDate: adj.next.airDate }
              : null;
            cacheRef.current.set(key, nx);
          }
        }
        if (nx && isNextAired(i._id, nx.airDate)) {
          next.set(i._id, {
            ...i,
            state: {
              ...i.state!,
              season: nx.season,
              episode: nx.episode,
              video_id: `${i._id}:${nx.season}:${nx.episode}`,
              timeOffset: 0,
              flaggedWatched: 0,
            },
            upNext: true,
          });
        } else if (fetchOk) {
          remove.add(i._id);
        }
      }
      const lib = library ?? items;
      const inCw = new Set(items.map((i) => i._id));
      const resurfaced = await resurfaceCandidates(lib, inCw, { tmdbKey, animeMode }).catch(
        () => new Map<string, { season: number; episode: number }>(),
      );
      if (cancelled) return;
      const extraItems: LibraryItem[] = [];
      for (const [id, ep] of resurfaced) {
        if (next.has(id)) continue;
        const src = lib.find((i) => i._id === id);
        if (!src?.state) continue;
        extraItems.push({
          ...src,
          state: {
            ...src.state,
            season: ep.season,
            episode: ep.episode,
            video_id: `${id}:${ep.season}:${ep.episode}`,
            timeOffset: 0,
            flaggedWatched: 0,
          },
          upNext: true,
        });
      }
      if (!cancelled) {
        setAdvanced((prev) => (sameMap(prev, next) ? prev : next));
        setExtra(extraItems);
        setRemoved((prev) => (sameSet(prev, remove) ? prev : remove));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items, tmdbKey, enabled, library, animeMode]);

  if (!enabled) return items;
  const base =
    advanced.size === 0 && removed.size === 0
      ? items
      : items.map((i) => advanced.get(i._id) ?? i).filter((i) => !removed.has(i._id));
  return extra.length === 0 ? base : base.concat(extra);
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}
