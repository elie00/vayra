import { useEffect, useRef, useState } from "react";
import { Check, Play, Plus } from "lucide-react";
import { Poster } from "@/components/poster";
import { PickCard } from "@/components/pick-card";
import { Row } from "@/components/row";
import type { Meta } from "@/lib/cinemeta";
import { getEpisodeProgress, resumeDefaultSeason } from "@/lib/episode-progress";
import { useT } from "@/lib/i18n";
import type { FranchiseEntry } from "@/lib/providers/anime-detail";
import type { KitsuEpisode } from "@/lib/providers/kitsu";
import { tmdbSeasonEpisodes, type Episode, type Season, type TmdbDetail } from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { openUrl } from "@/lib/window";
import { AnimeEpisodes } from "@/views/detail/anime-episodes";
import { CastCard } from "@/views/detail/cast-card";
import { CinemetaEpisodes } from "@/views/detail/cinemeta-episodes";
import { PreviewIcon } from "@/views/detail/preview-icon";
import { Synopsis } from "@/views/detail/synopsis";

// Mobile-first Detail (Apple "pulled-up content" model). Rendered from
// `DetailView` in src/views/detail.tsx when isMobileTauri(); every data hook /
// effect / memo still runs in the original component and its already-computed
// values arrive here as props (no re-fetching). Single column: backdrop hero →
// action row → synopsis → episodes (series) → cast + related rails.
//
// Usage (inside DetailView, right before the desktop return):
//   if (isMobileTauri())
//     return (
//       <MobileDetail
//         meta={meta}
//         playMeta={playMeta}
//         title={title}
//         logo={logo}
//         backdrop={backdrop}
//         year={year}
//         rating={rating}
//         runtime={runtime}
//         overview={overview}
//         isSeries={isSeries}
//         isAnime={isAnime}
//         detail={detail}
//         recommendations={recommendations}
//         similar={similar}
//         cinemetaVideos={cinemetaFull?.videos}
//         stremioWatched={stremioWatched}
//         animeEpisodes={animeEpisodes}
//         franchise={franchise}
//         animeCanonicalId={animeCanonicalId}
//         inWatchlist={inWatchlist}
//         onToggleWatchlist={() => toggleWatchlist({ ... })}
//         onPlay={() => smartPlay(false)}
//         playLabel={smartPlayLabel}
//         trailerCandidate={trailerCandidate}
//       />
//     );
export function MobileDetail({
  meta,
  playMeta,
  title,
  logo,
  backdrop,
  year,
  rating,
  runtime,
  overview,
  isSeries,
  isAnime,
  detail,
  recommendations,
  similar,
  cinemetaVideos,
  stremioWatched,
  animeEpisodes,
  franchise,
  animeCanonicalId,
  inWatchlist,
  onToggleWatchlist,
  onPlay,
  playLabel,
  trailerCandidate,
}: {
  meta: Meta;
  playMeta: Meta;
  title: string;
  logo?: string;
  backdrop?: string;
  year?: string;
  rating?: string;
  runtime?: string;
  overview: string;
  isSeries: boolean;
  isAnime: boolean;
  detail: TmdbDetail | null;
  recommendations: Meta[];
  similar: Meta[];
  cinemetaVideos?: NonNullable<Meta["videos"]>;
  stremioWatched: Set<string>;
  animeEpisodes: KitsuEpisode[];
  franchise: FranchiseEntry[];
  animeCanonicalId: string | null;
  inWatchlist: boolean;
  onToggleWatchlist: () => void;
  onPlay: () => void;
  playLabel: string;
  trailerCandidate: string | null;
}) {
  const t = useT();
  const scrollRef = useRef<HTMLElement>(null);

  const metaBits = [year, rating ? `★ ${rating}` : null, runtime].filter(Boolean) as string[];

  const showAnime = isAnime && (animeEpisodes.length > 1 || franchise.length > 1);
  const showTmdbSeries =
    !isAnime && isSeries && detail != null && detail.seasons.length > 0;
  const cinemetaHasEpisodes =
    !!cinemetaVideos &&
    cinemetaVideos.some((v) => v.season != null && v.season > 0 && v.episode != null);
  const showCinemetaSeries =
    !isAnime && isSeries && !showTmdbSeries && cinemetaHasEpisodes;

  return (
    <main ref={scrollRef} className="absolute inset-0 z-30 overflow-y-auto bg-canvas">
      <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        {/* Hero backdrop */}
        <div className="relative">
          <div className="relative aspect-[3/4] w-full overflow-hidden bg-elevated">
            {backdrop && (
              <img
                src={backdrop}
                alt=""
                decoding="async"
                fetchPriority="high"
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/35 to-transparent" />
          </div>
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 px-4 pb-2">
            {logo ? (
              <img
                src={logo}
                alt={title}
                decoding="async"
                className="max-h-24 w-auto max-w-[80%] object-contain object-left drop-shadow-[0_4px_18px_rgba(0,0,0,0.5)]"
              />
            ) : (
              <h1 className="text-[34px] font-semibold leading-[1.02] tracking-tight text-ink">
                {title}
              </h1>
            )}
            {metaBits.length > 0 && (
              <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink-muted">
                {metaBits.map((b, i) => (
                  <span key={i} className="flex items-center gap-2">
                    {i > 0 && <span className="text-ink-subtle">·</span>}
                    {b}
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-8 px-4 pt-4">
          {/* Action row */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onPlay}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-semibold text-canvas transition-transform active:scale-95"
            >
              <Play size={18} fill="currentColor" />
              {playLabel}
            </button>
            <button
              type="button"
              onClick={onToggleWatchlist}
              aria-label={inWatchlist ? t("In Watchlist") : t("Add to Watchlist")}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-transform active:scale-95 ${
                inWatchlist
                  ? "border-ink bg-ink/10 text-ink"
                  : "border-edge bg-canvas/60 text-ink"
              }`}
            >
              {inWatchlist ? <Check size={19} strokeWidth={2.4} /> : <Plus size={19} strokeWidth={2} />}
            </button>
            {trailerCandidate && (
              <button
                type="button"
                onClick={() => openUrl(`https://www.youtube.com/watch?v=${trailerCandidate}`)}
                aria-label={t("Watch trailer")}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-edge bg-canvas/60 text-ink transition-transform active:scale-95"
              >
                <PreviewIcon size={20} />
              </button>
            )}
          </div>

          {/* Synopsis (clamp-4 + Show more/less, reused from desktop) */}
          {overview && <Synopsis text={overview} />}

          {/* Episodes */}
          {showTmdbSeries && detail && (
            <MobileEpisodes
              meta={playMeta}
              tvId={detail.id}
              seasons={detail.seasons}
              stremioWatched={stremioWatched}
              cinemetaVideos={cinemetaVideos}
            />
          )}
          {showAnime && (
            <AnimeEpisodes
              meta={playMeta}
              episodes={animeEpisodes}
              franchise={franchise}
              currentId={animeCanonicalId ?? meta.id}
              scrollRef={scrollRef}
              trackId={animeCanonicalId ?? undefined}
            />
          )}
          {showCinemetaSeries && cinemetaVideos && (
            <CinemetaEpisodes meta={playMeta} videos={cinemetaVideos} />
          )}

          {/* Cast rail */}
          {detail && detail.cast.length > 0 && (
            <Row title={t("Cast · {n}", { n: detail.cast.length })} min={104}>
              {detail.cast.map((c, i) => (
                <CastCard key={`${c.id}-${i}`} cast={c} />
              ))}
            </Row>
          )}

          {/* Related rails */}
          {recommendations.length > 0 && (
            <Row title={t("More Like This")} min={112}>
              {recommendations.map((r) => (
                <PickCard key={r.id} meta={r} />
              ))}
            </Row>
          )}
          {similar.length > 0 && (
            <Row title={t("You Might Also Like")} min={112}>
              {similar.map((r) => (
                <PickCard key={`s-${r.id}`} meta={r} />
              ))}
            </Row>
          )}
        </div>
      </div>
    </main>
  );
}

const EMPTY_WATCHED = new Set<string>();

// Mobile series episodes: season chips + full-width touch rows. Reuses the same
// per-season fetch (tmdbSeasonEpisodes), default-season logic (resumeDefaultSeason),
// watched/progress data (getEpisodeProgress) and play handler (openPicker) the
// desktop SeriesEpisodes uses — no new backend calls.
function MobileEpisodes({
  meta,
  tvId,
  seasons,
  stremioWatched,
  cinemetaVideos,
}: {
  meta: Meta;
  tvId: number;
  seasons: Season[];
  stremioWatched: Set<string>;
  cinemetaVideos?: NonNullable<Meta["videos"]>;
}) {
  const t = useT();
  const { settings } = useSettings();
  const realSeasons = seasons.filter((s) => s.seasonNumber >= 1 && s.episodeCount > 0);
  const [active, setActive] = useState(() =>
    resumeDefaultSeason(meta.id, seasons, stremioWatched),
  );
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    tmdbSeasonEpisodes(settings.tmdbKey, tvId, active).then((eps) => {
      if (cancelled) return;
      setEpisodes(eps);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tvId, active, settings.tmdbKey]);

  return (
    <section data-episodes className="flex scroll-mt-24 flex-col gap-4">
      <h3 className="text-[19px] font-semibold tracking-tight text-ink">{t("Episodes")}</h3>
      {realSeasons.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {realSeasons.map((s) => {
            const on = s.seasonNumber === active;
            return (
              <button
                key={s.seasonNumber}
                type="button"
                onClick={() => setActive(s.seasonNumber)}
                aria-pressed={on}
                className={`shrink-0 rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors ${
                  on ? "bg-ink text-canvas" : "bg-elevated/60 text-ink-muted"
                }`}
              >
                {t("Season {n}", { n: s.seasonNumber })}
              </button>
            );
          })}
        </div>
      )}
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <div className="aspect-video w-32 shrink-0 animate-pulse rounded-xl bg-elevated/40" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-3.5 w-3/5 animate-pulse rounded bg-elevated/40" />
                <div className="h-3 w-2/5 animate-pulse rounded bg-elevated/30" />
              </div>
            </div>
          ))}
        </div>
      ) : episodes.length === 0 ? (
        <p className="text-[14px] text-ink-subtle">
          {t("No episodes available for this season.")}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {episodes.map((ep) => (
            <MobileEpisodeRow
              key={ep.id}
              meta={meta}
              ep={ep}
              stremioWatched={stremioWatched}
              cinemetaVideos={cinemetaVideos}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MobileEpisodeRow({
  meta,
  ep,
  stremioWatched,
  cinemetaVideos,
}: {
  meta: Meta;
  ep: Episode;
  stremioWatched: Set<string>;
  cinemetaVideos?: NonNullable<Meta["videos"]>;
}) {
  const t = useT();
  const { openPicker } = useView();
  const { settings } = useSettings();
  const [imgIdx, setImgIdx] = useState(0);
  const tmdbStill = ep.stillPath ? `https://image.tmdb.org/t/p/w300${ep.stillPath}` : undefined;
  const cine = cinemetaVideos?.find(
    (v) => v.season === ep.seasonNumber && v.episode === ep.episodeNumber,
  )?.thumbnail;
  const candidates = [tmdbStill, cine].filter((u): u is string => !!u);
  const still = candidates[imgIdx];
  const progress = getEpisodeProgress(
    meta.id,
    ep.seasonNumber,
    ep.episodeNumber,
    ep.runtime,
    null,
    EMPTY_WATCHED,
    stremioWatched,
    undefined,
    EMPTY_WATCHED,
  );
  const play = () =>
    openPicker(
      meta,
      {
        season: ep.seasonNumber,
        episode: ep.episodeNumber,
        name: ep.name || undefined,
        still,
        overview: ep.overview || undefined,
      },
      { autoPlay: settings.instantPlay },
    );

  return (
    <button
      type="button"
      onClick={play}
      className="flex items-center gap-3 rounded-2xl p-2 text-start transition-colors active:bg-elevated/40"
    >
      <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl">
        <Poster
          src={still}
          seed={String(ep.id)}
          ratio="landscape"
          lazy
          onError={() => setImgIdx((i) => i + 1)}
        />
        <span className="absolute start-1.5 top-1.5 rounded-md bg-canvas/95 px-1.5 py-0.5 text-[11px] font-semibold text-ink">
          {ep.episodeNumber}
        </span>
        {progress.watched && (
          <span className="absolute end-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/25 text-emerald-200 ring-1 ring-emerald-400/40 backdrop-blur-sm">
            <Check size={11} strokeWidth={3} />
          </span>
        )}
        {progress.ratio > 0.01 && (
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/55">
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.max(2, progress.ratio * 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-[14.5px] font-medium text-ink">
          {ep.name || t("Episode {n}", { n: ep.episodeNumber })}
        </p>
        <p className="text-[12px] text-ink-subtle">
          {[
            `S${ep.seasonNumber} E${ep.episodeNumber}`,
            ep.runtime ? t("{n} min", { n: ep.runtime }) : null,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-subtle">
        <Play size={16} fill="currentColor" />
      </span>
    </button>
  );
}
