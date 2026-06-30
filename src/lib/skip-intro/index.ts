import { useEffect, useMemo, useState } from "react";
import type { Meta } from "../cinemeta";
import type { Chapter } from "../player/bridge";
import type { PlayEpisode, PlayerStreamRef } from "../view";
import { fetchAdSegments } from "./adcorpus";
import { fingerprint } from "./fingerprint";
import { fetchAniSkipSegments, kitsuToMal } from "./aniskip";
import { chaptersToSegments } from "./chapters";
import { fetchIntroDbSegments } from "./theintrodb";
import type { SkipSegment } from "./types";

export type { SkipSegment, SkipKind, SkipSource } from "./types";

const MIN_OUTRO_START_FRACTION = 0.5;
const MAX_SEGMENT_SEC = 360;

function parseKitsuId(id: string): number | null {
  if (!id.startsWith("kitsu:")) return null;
  const n = parseInt(id.slice("kitsu:".length).split(":")[0], 10);
  return Number.isFinite(n) ? n : null;
}

export function useSkipSegments(
  meta: Meta,
  episode: PlayEpisode | undefined,
  chapters: Chapter[],
  durationSec: number,
  adSegments: SkipSegment[] = [],
): SkipSegment[] {
  const [aniSkip, setAniSkip] = useState<SkipSegment[]>([]);
  const [introDb, setIntroDb] = useState<SkipSegment[]>([]);
  const kitsuId = parseKitsuId(meta.id);
  const epNum = episode?.episode;
  const introSeason = episode?.imdbSeason ?? episode?.season;
  const introEpisode = episode?.imdbEpisode ?? episode?.episode;
  const introDbId =
    meta.id.startsWith("tt") || meta.id.startsWith("tmdb:")
      ? meta.id
      : episode?.imdbId && episode.imdbId.startsWith("tt")
        ? episode.imdbId
        : meta.id;

  useEffect(() => {
    setAniSkip([]);
    if (kitsuId == null || epNum == null || durationSec <= 0) return;
    let cancelled = false;
    (async () => {
      const malId = await kitsuToMal(kitsuId);
      if (cancelled || malId == null) return;
      const segs = await fetchAniSkipSegments(malId, epNum, durationSec);
      if (cancelled) return;
      setAniSkip(segs);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [kitsuId, epNum, durationSec]);

  useEffect(() => {
    setIntroDb([]);
    if (durationSec <= 0) return;
    if (!introDbId.startsWith("tmdb:") && !introDbId.startsWith("tt")) return;
    let cancelled = false;
    const ep =
      introSeason != null && introEpisode != null
        ? { season: introSeason, episode: introEpisode }
        : undefined;
    fetchIntroDbSegments(introDbId, ep, durationSec)
      .then((segs) => {
        if (!cancelled) setIntroDb(segs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [introDbId, introSeason, introEpisode, durationSec]);

  const fromChapters = useMemo(
    () => chaptersToSegments(chapters, durationSec),
    [chapters, durationSec],
  );

  return useMemo(() => {
    const chosen = aniSkip.length > 0 ? aniSkip : introDb.length > 0 ? introDb : fromChapters;
    const base = adSegments.length > 0 ? [...chosen, ...adSegments] : chosen;
    if (durationSec <= 0) return base;
    const minOutroStart = durationSec * MIN_OUTRO_START_FRACTION;
    return base
      .filter((s) => s.startSec < durationSec)
      .map((s) => (s.endSec > durationSec ? { ...s, endSec: durationSec } : s))
      .filter((s) => {
        const len = s.endSec - s.startSec;
        return len >= 2 && len <= MAX_SEGMENT_SEC;
      })
      .filter((s) => s.kind !== "outro" || s.startSec >= minOutroStart);
  }, [aniSkip, introDb, fromChapters, durationSec, adSegments]);
}

export function useAdSegments(
  metaId: string,
  imdbId: string | null,
  streamRef: PlayerStreamRef | undefined,
  url: string,
  enabled: boolean,
): SkipSegment[] {
  const [segs, setSegs] = useState<SkipSegment[]>([]);
  const fp = useMemo(
    () => fingerprint(metaId, imdbId, streamRef, url),
    [metaId, imdbId, streamRef, url],
  );
  useEffect(() => {
    setSegs([]);
    if (!enabled) return;
    let cancelled = false;
    fetchAdSegments(fp.content, fp.source, true)
      .then((s) => {
        if (!cancelled) setSegs(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, fp.content, fp.source]);
  return segs;
}

export function activeSegment(
  segments: SkipSegment[],
  positionSec: number,
): SkipSegment | null {
  for (const s of segments) {
    if (positionSec >= s.startSec && positionSec < s.endSec - 0.75) return s;
  }
  return null;
}
