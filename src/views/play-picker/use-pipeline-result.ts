import { useCallback, useEffect, useMemo, useState } from "react";
import type { Addon } from "@/lib/addons";
import { isAddonNativeMeta, type Meta } from "@/lib/cinemeta";
import { useDebridClients } from "@/lib/debrid/registry";
import { buildPickerConfigHash, clearOnePickerCache, getPickerCache, setPickerCache } from "@/lib/picker-cache";
import { useSettings } from "@/lib/settings";
import { readPlayback } from "@/lib/playback-history";
import { runPipeline, type PipelineResult } from "@/lib/streams/pipeline";
import type { Stream } from "@/lib/streams/types";
import type { PlayEpisode } from "@/lib/view";
import { parseRuntimeMinutes, stampAddonOrder } from "./picker-utils";

type Settings = ReturnType<typeof useSettings>["settings"];

export function usePipelineResult({
  meta,
  episode,
  imdbId,
  streamIds,
  addons,
  debrids,
  settings,
  strictMode,
  filterDisabled,
}: {
  meta: Meta;
  episode: PlayEpisode | undefined;
  imdbId: string | null;
  streamIds: string[] | null;
  addons: Addon[] | null;
  debrids: ReturnType<typeof useDebridClients>;
  settings: Settings;
  strictMode: boolean;
  filterDisabled: boolean;
}) {
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [pipelineDone, setPipelineDone] = useState(false);
  const [firstResultAt, setFirstResultAt] = useState<number | null>(null);
  const [autoSettleReady, setAutoSettleReady] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const embedded = useMemo<Stream[]>(() => {
    const vids = meta.videos ?? [];
    if (vids.length === 0) return [];
    const pick = episode?.videoId
      ? vids.find((v) => v.id === episode.videoId)
      : episode
        ? vids.find(
            (v) =>
              (v.season ?? null) === episode.season &&
              ((v.episode ?? v.number) ?? null) === episode.episode,
          )
        : vids.find((v) => v.id === meta.id) ?? (vids.length === 1 ? vids[0] : undefined);
    const raw = pick?.streams ?? [];
    return raw.map(
      (s) =>
        ({
          ...s,
          addonId: meta.addonOrigin?.id ?? "embedded",
          addonName: meta.addonOrigin?.name ?? "Addon",
          addonUrl: meta.addonOrigin?.base,
        }) as unknown as Stream,
    );
  }, [meta, episode?.videoId, episode?.season, episode?.episode]);

  const configHash = useMemo(
    () =>
      buildPickerConfigHash({
        addonTransportUrls: (addons ?? []).map((a) => a.transportUrl),
        debridSlugs: debrids.map((d) => d.slug),
        scraperKeys: [],
        filterMode: filterDisabled ? "off" : strictMode ? "strict" : "balanced",
      }),
    [addons, debrids, filterDisabled, strictMode],
  );

  useEffect(() => {
    if (!streamIds || addons === null) return;
    const ac = new AbortController();
    const cached = getPickerCache(meta, episode, configHash);
    if (cached) {
      setResult({ ...cached.result, raw: { addon: [], library: [] } });
      setLoading(false);
      setPipelineDone(true);
      setFirstResultAt(performance.now());
      setAutoSettleReady(true);
      setResolveError(null);
      return () => ac.abort();
    }
    setLoading(true);
    setResult(null);
    setResolveError(null);
    setPipelineDone(false);
    setFirstResultAt(null);
    setAutoSettleReady(false);
    const addonNative = isAddonNativeMeta(meta);
    const requestType = addonNative
      ? meta.type
      : episode
        ? "series"
        : meta.type === "series"
          ? "series"
          : "movie";
    const animeReq = streamIds.some((id) => id.startsWith("kitsu:") || id.startsWith("mal:"));
    const effSeason = episode?.imdbSeason ?? episode?.season;
    const effEpisode = episode?.imdbEpisode ?? episode?.episode;
    const prevGroup =
      episode && typeof effSeason === "number" && typeof effEpisode === "number" && effEpisode > 1
        ? readPlayback(meta.id, effSeason, effEpisode - 1)?.releaseGroup ?? undefined
        : undefined;
    runPipeline(
      {
        request: {
          type: requestType,
          ids: streamIds,
        },
        query: {
          type: episode ? "series" : meta.type === "series" ? "series" : "movie",
          imdbId: imdbId ?? "",
          title: meta.name,
          year: parseInt(meta.releaseInfo ?? "", 10) || undefined,
          season: animeReq && episode?.imdbSeason == null ? undefined : effSeason,
          episode: animeReq && episode?.imdbEpisode == null ? episode?.episode : effEpisode,
        },
        addons,
        debrids,
        isAnime: animeReq,
        presetStreams: embedded.length > 0 ? embedded : undefined,
        trust: {
          kind: episode ? "series" : meta.type === "series" ? "series" : "movie",
          expectedTitle: meta.name,
          releaseDate: meta.releaseDate ?? null,
          expectedYear: parseInt(meta.releaseInfo ?? "", 10) || null,
          expectedSeason: effSeason ?? null,
          expectedEpisode: effEpisode ?? null,
          strict: strictMode,
          disabled: filterDisabled || addonNative || embedded.length > 0,
          preferredLanguages: settings.preferredLanguages,
          preferredAudioLangs: settings.preferredAudioLangs,
          requirePreferredLanguage: strictMode && settings.requirePreferredLanguage,
          allowSeasonPacks: !strictMode,
          allowSizeOutliers: !strictMode,
          isAnime: animeReq,
        },
        score: {
          activeDebrids: debrids.map((d) => d.slug),
          preferredLanguages: settings.preferredLanguages,
          releaseDate: meta.releaseDate ?? null,
          mediaKind: meta.type === "series" || episode ? "series" : "movie",
          runtimeMinutes: parseRuntimeMinutes(meta.runtime),
          inTheaters: meta.inTheaters === true,
          bandwidthMbps: settings.bandwidthMbps > 0 ? settings.bandwidthMbps : undefined,
          preferSingleAudioTrack:
            !("__TAURI_INTERNALS__" in window) || settings.playerEngine === "html5",
          preferAddonId: meta.addonOrigin?.id,
          preferredReleaseGroup: prevGroup,
          respectAddonOrder: settings.streamSort === "addon",
        },
      },
      ac.signal,
      (partial) => {
        if (ac.signal.aborted) return;
        if (partial.picker.all.length === 0) return;
        stampAddonOrder(partial.picker.all, partial.raw.addon);
        setResult(partial);
        setLoading(false);
        setFirstResultAt((prev) => prev ?? performance.now());
        setPickerCache(meta, episode, partial, configHash);
      },
    )
      .then((r) => {
        if (ac.signal.aborted) return;
        stampAddonOrder(r.picker.all, r.raw.addon);
        setResult(r);
        setLoading(false);
        setPipelineDone(true);
        setAutoSettleReady(true);
        setPickerCache(meta, episode, r, configHash);
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setResolveError(e instanceof Error ? e.message : "Couldn't load streams. Check your addons and connection.");
        setLoading(false);
        setPipelineDone(true);
        setAutoSettleReady(true);
      });
    return () => ac.abort();
  }, [
    streamIds,
    imdbId,
    addons,
    debrids,
    meta.id,
    meta.name,
    meta.type,
    meta.releaseInfo,
    episode?.season,
    episode?.episode,
    embedded,
    settings.preferredLanguages,
    settings.requirePreferredLanguage,
    strictMode,
    filterDisabled,
    refreshNonce,
  ]);

  const refresh = useCallback(() => {
    clearOnePickerCache(meta, episode);
    setRefreshNonce((n) => n + 1);
  }, [meta, episode]);

  return {
    result,
    loading,
    pipelineDone,
    firstResultAt,
    autoSettleReady,
    resolveError,
    refresh,
    setResult,
    setLoading,
    setPipelineDone,
    setFirstResultAt,
    setAutoSettleReady,
    setResolveError,
  };
}
