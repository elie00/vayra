import { useMemo, useState, useSyncExternalStore } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { getLastSeason, setLastSeason } from "@/lib/last-season";
import { useLocalAwareSeriesPlay } from "@/lib/local-library/use-series-play";
import { manualWatchedState, manualWatchedVersion, subscribeManualWatched } from "@/lib/manual-watched";
import { useSettings } from "@/lib/settings";
import { EpisodeDownloadButton } from "@/views/detail/episode-download-button";
import { MobileEpisodeItem } from "./episode-item";

type Video = NonNullable<Meta["videos"]>[number];

/**
 * Episodes from Cinemeta (no TMDB key) on a phone: season chips, then the same
 * rows as the TMDB list, with each episode's synopsis. The desktop list kept a
 * fixed 200px still and no synopsis, too cramped for a phone.
 */
export function MobileCinemetaEpisodes({ meta, videos }: { meta: Meta; videos: Video[] }) {
  const t = useT();
  const { settings } = useSettings();
  const playLocalAware = useLocalAwareSeriesPlay();
  useSyncExternalStore(subscribeManualWatched, manualWatchedVersion);

  const seasons = useMemo(() => {
    const map = new Map<number, Video[]>();
    for (const v of videos) {
      const n = v.episode ?? v.number;
      if (v.season == null || v.season < 1 || n == null) continue;
      map.set(v.season, [...(map.get(v.season) ?? []), v]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([season, eps]) => ({ season, eps: eps.sort((a, b) => (a.episode ?? a.number ?? 0) - (b.episode ?? b.number ?? 0)) }));
  }, [videos]);
  const [active, setActive] = useState(() => {
    const last = getLastSeason(meta.id);
    return last != null && seasons.some((s) => s.season === last) ? last : seasons[0]?.season ?? 1;
  });
  const current = seasons.find((s) => s.season === active) ?? seasons[0];
  if (!current) return null;

  return (
    <section className="flex flex-col gap-2">
      {seasons.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {seasons.map((s) => (
            <button
              key={s.season}
              type="button"
              onClick={() => {
                setActive(s.season);
                setLastSeason(meta.id, s.season);
              }}
              aria-pressed={s.season === current.season}
              className={`shrink-0 rounded-full px-4 py-2 type-footnote font-medium transition-colors ${
                s.season === current.season ? "bg-ink text-canvas" : "bg-elevated/60 text-ink-muted"
              }`}
            >
              {t("Season {n}", { n: s.season })}
            </button>
          ))}
        </div>
      )}
      <ul className="flex flex-col divide-y divide-white/6">
        {current.eps.map((v) => {
          const n = v.episode ?? v.number ?? 1;
          const title = v.name || v.title || t("Episode {n}", { n });
          const episode = { season: current.season, episode: n, name: v.name || v.title || undefined, videoId: v.id || undefined, still: v.thumbnail || undefined };
          const aired = formatAired(v.released ?? v.firstAired);
          return (
            <MobileEpisodeItem
              key={v.id ?? `${current.season}-${n}`}
              number={n}
              title={title}
              facts={aired ? [aired] : []}
              synopsis={v.overview || v.description || undefined}
              still={v.thumbnail || undefined}
              seed={v.id ?? `${meta.id}-${current.season}-${n}`}
              watched={manualWatchedState(meta.id, current.season, n) === true}
              onPlay={() => playLocalAware({ meta, episode, opts: { autoPlay: settings.instantPlay || settings.seasonSourceLock } })}
              trailing={<EpisodeDownloadButton meta={meta} episode={episode} size={36} />}
            />
          );
        })}
      </ul>
    </section>
  );
}

function formatAired(date?: string): string | null {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
