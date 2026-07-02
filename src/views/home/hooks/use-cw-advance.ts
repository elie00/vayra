import { useEffect, useRef, useState } from "react";
import { fetchEpisodeList, nextUnwatchedAfter } from "@/lib/series-episodes";
import type { Meta } from "@/lib/cinemeta";
import type { PlayEpisode } from "@/lib/view";
import { manualWatchedState } from "@/lib/manual-watched";
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

function watchedPredicate(i: LibraryItem, cur: { season: number; episode: number }) {
  const finished = isFinishedSeries(i);
  return (season: number, episode: number): boolean => {
    const ms = manualWatchedState(i._id, season, episode);
    if (ms !== undefined) return ms;
    if (season === cur.season && episode === cur.episode) return finished;
    return false;
  };
}

function sameMap(a: Map<string, LibraryItem>, b: Map<string, LibraryItem>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

export function useCwAdvance(
  items: LibraryItem[],
  tmdbKey: string,
  enabled: boolean,
  library?: LibraryItem[],
  animeMode: AnimeMode = "all",
  watchedVersion = 0,
): LibraryItem[] {
  const [advanced, setAdvanced] = useState<Map<string, LibraryItem>>(new Map());
  const [extra, setExtra] = useState<LibraryItem[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const listCacheRef = useRef<Map<string, PlayEpisode[]>>(new Map());

  useEffect(() => {
    if (!enabled) {
      setAdvanced((prev) => (prev.size === 0 ? prev : new Map()));
      setExtra((prev) => (prev.length === 0 ? prev : []));
      setRemoved((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    let cancelled = false;
    const targets = items.filter((i) => {
      const cur = currentEpisode(i);
      return cur != null && watchedPredicate(i, cur)(cur.season, cur.episode);
    });
    void (async () => {
      const next = new Map<string, LibraryItem>();
      const remove = new Set<string>();
      for (const i of targets) {
        const cur = currentEpisode(i)!;
        let list = listCacheRef.current.get(i._id);
        let fetchOk = list !== undefined;
        if (list === undefined) {
          const meta: Meta = {
            id: i._id,
            type: libraryMetaType(i.type),
            name: i.name,
            poster: i.poster,
            background: i.background,
          };
          const res = await fetchEpisodeList(meta, { tmdbKey })
            .then((eps) => ({ ok: true, eps }))
            .catch(() => ({ ok: false, eps: [] as PlayEpisode[] }));
          if (cancelled) return;
          fetchOk = res.ok;
          if (res.ok) {
            list = res.eps;
            listCacheRef.current.set(i._id, list);
          }
        }
        if (!list) continue;
        const nextEp = nextUnwatchedAfter(list, cur, watchedPredicate(i, cur));
        if (nextEp && isNextAired(i._id, nextEp.airDate)) {
          next.set(i._id, {
            ...i,
            state: {
              ...i.state!,
              season: nextEp.season,
              episode: nextEp.episode,
              video_id: `${i._id}:${nextEp.season}:${nextEp.episode}`,
              timeOffset: 0,
              flaggedWatched: 0,
            },
            upNext: true,
          });
        } else if (fetchOk && list.length > 0) {
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
  }, [items, tmdbKey, enabled, library, animeMode, watchedVersion]);

  if (!enabled) return items;
  const base =
    advanced.size === 0 && removed.size === 0
      ? items
      : items.map((i) => advanced.get(i._id) ?? i).filter((i) => !removed.has(i._id));
  if (extra.length === 0) return base;
  const keyOf = (i: LibraryItem) => `${i.type}|${(i.name ?? "").trim().toLowerCase()}`;
  const baseKeys = new Set(base.map(keyOf));
  const dedupExtra = extra.filter((i) => !baseKeys.has(keyOf(i)));
  return dedupExtra.length === 0 ? base : base.concat(dedupExtra);
}
