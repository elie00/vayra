import { Bookmark, Popcorn, RefreshCcw } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { awardSourceMeta, findTopAward, parseAwardYear, type AwardWin } from "@/lib/anime-awards";
import { meta as fetchMeta, narrowMediaType, type Meta } from "@/lib/cinemeta";
import { useContextMenu } from "@/lib/context-menu";
import { useT } from "@/lib/i18n";
import {
  hoverPreviewBlur,
  hoverPreviewEnter,
  hoverPreviewFocus,
  hoverPreviewLeave,
} from "@/lib/hover-preview/store";
import { animeKitsuMeta } from "@/lib/providers/anime-kitsu-addon";
import { omdbPrefetch, useOmdbScores } from "@/lib/providers/omdb";
import { mdblistCardPrefetch, useMdblistCardScores } from "@/lib/providers/mdblist-batch";
import { needsImdbForPoster, rpdbPoster } from "@/lib/providers/rpdb";
import { tmdbImdbId, useTmdbImdbId } from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { observe } from "@/lib/visibility";
import { useInWatchlist } from "@/lib/watchlist";
import { ClapperMini } from "./icons/clapper-mini";
import { ImdbIcon } from "./icons/imdb-icon";
import { MalLogo } from "./icons/mal-logo";
import { Poster } from "./poster";
import { RtBadge } from "./rt-badge";

export const PickCard = memo(function PickCard({
  meta,
  flagRerun = false,
  awardLookupName,
}: {
  meta: Meta;
  flagRerun?: boolean;
  awardLookupName?: string;
}) {
  const { openMeta } = useView();
  const { open: openContextMenu } = useContextMenu();
  const { settings } = useSettings();
  const t = useT();
  const isAnimeCardId = /^(kitsu|mal|anilist|anidb):/.test(meta.id);
  const inCinema = isInCinema(meta);
  const rerun = (inCinema || flagRerun) && isRerun(meta);
  const showCinema = inCinema && !rerun;
  const newBadge = !rerun && !inCinema ? deriveBadge(meta) : null;
  const resolvedImdb = useTmdbImdbId(meta.id);
  const imdbId = resolvedImdb ?? undefined;
  const cached = useOmdbScores(imdbId);
  const mediaKind = meta.type === "series" ? "show" : "movie";
  const audience = useMdblistCardScores(settings.showRtBadge ? imdbId : undefined, mediaKind);
  const ref = useRef<HTMLButtonElement>(null);
  const altIds = useMemo(() => [imdbId], [imdbId]);
  const inWatchlist = useInWatchlist(meta.id, altIds);

  const [imgIdx, setImgIdx] = useState(0);
  const [hydratedPoster, setHydratedPoster] = useState<string | undefined>();
  const posterId =
    needsImdbForPoster(settings.rpdbKey, meta.id) && imdbId ? imdbId : meta.id;
  const posterCandidates = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of [
      rpdbPoster(settings.rpdbKey, posterId, meta.poster),
      meta.poster,
      hydratedPoster,
    ]) {
      if (!u || seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
    return out;
  }, [settings.rpdbKey, posterId, meta.poster, hydratedPoster]);
  const posterSrc = posterCandidates[imgIdx];

  useEffect(() => {
    setImgIdx(0);
  }, [posterCandidates]);

  useEffect(() => {
    setHydratedPoster(undefined);
  }, [meta.id]);

  useEffect(() => {
    if (posterSrc !== undefined || hydratedPoster) return;
    let cancelled = false;
    const isAnimeId =
      meta.id.startsWith("kitsu:") ||
      meta.id.startsWith("mal:") ||
      meta.id.startsWith("anilist:") ||
      meta.id.startsWith("anidb:");
    const hydrator = isAnimeId
      ? animeKitsuMeta(meta.id).then((m) => (m ? { poster: m.poster } : null))
      : fetchMeta(narrowMediaType(meta.type), meta.id).then((full) =>
          full ? { poster: full.poster } : null,
        );
    hydrator
      .then((res) => {
        if (cancelled || !res?.poster) return;
        setHydratedPoster(res.poster);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [posterSrc, hydratedPoster, meta.type, meta.id]);

  useEffect(() => {
    if (!settings.omdbKey && !settings.mdblistKey && !needsImdbForPoster(settings.rpdbKey, meta.id)) return;
    const el = ref.current;
    if (!el) return;
    let off: (() => void) | null = null;
    off = observe(el, async (visible) => {
      if (!visible) return;
      off?.();
      off = null;
      const id = await tmdbImdbId(settings.tmdbKey, meta.id);
      if (!id) return;
      if (settings.omdbKey) omdbPrefetch(settings.omdbKey, id);
      if (settings.mdblistKey && settings.showRtBadge) {
        mdblistCardPrefetch(id, meta.type === "series" ? "show" : "movie");
      }
    });
    return () => off?.();
  }, [meta.id, meta.type, settings.tmdbKey, settings.omdbKey, settings.mdblistKey, settings.showRtBadge, settings.rpdbKey]);

  return (
    <button
      ref={ref}
      onClick={() => openMeta(meta)}
      onContextMenu={(e) => openContextMenu(e, { kind: "meta", meta })}
      onFocus={(e) => hoverPreviewFocus(meta, e.currentTarget)}
      onBlur={(e) => hoverPreviewBlur(e.currentTarget)}
      className="group flex w-full min-w-0 flex-col gap-2.5 text-start"
    >
      <div
        data-preview-anchor
        onPointerEnter={(e) => hoverPreviewEnter(meta, e.currentTarget, e.buttons)}
        onPointerLeave={(e) => hoverPreviewLeave(e.currentTarget)}
        className="relative transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0.24,1)] group-hover:-translate-y-2"
      >
        <Poster
          src={posterSrc}
          seed={meta.id}
          ratio="portrait"
          onError={() => setImgIdx((i) => i + 1)}
          className="harbor-card-ring rounded-xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] transition-[box-shadow] duration-300 group-hover:shadow-[0_24px_48px_-14px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.08)]"
        />
        {rerun && <RerunBadge year={meta.releaseInfo} />}
        {showCinema && <CinemaBadge />}
        {newBadge && <Badge label={t(newBadge.label)} tone={newBadge.tone} />}
        <AnimeAwardBadge
          name={awardLookupName ?? meta.name}
          fallbackName={meta.name}
          year={parseAwardYear(meta.releaseInfo)}
          stacked={rerun || showCinema || !!newBadge}
        />
        {inWatchlist && (
          <span
            className={`pointer-events-none absolute end-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-canvas/85 text-ink ring-1 ring-edge-soft/70 backdrop-blur-sm ${
              settings.badgePlacement === "top" ? "bottom-1.5" : "top-1.5"
            }`}
            title={t("In your watchlist")}
            aria-label={t("In watchlist")}
          >
            <Bookmark size={11} strokeWidth={2.6} fill="currentColor" />
          </span>
        )}
        <ScoreStack
          rating={
            isAnimeCardId
              ? settings.showMalBadge
                ? meta.imdbRating
                : undefined
              : settings.showImdbBadge
                ? cached?.imdbRating ?? meta.imdbRating
                : undefined
          }
          rt={settings.showRtBadge ? cached?.rtCritics : undefined}
          audience={settings.showRtBadge ? audience?.rtAudience ?? undefined : undefined}
          source={isAnimeCardId ? "mal" : "imdb"}
          placement={settings.badgePlacement}
        />
      </div>
      {!settings.hidePosterTitles && (
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">
          {meta.name}
        </p>
      )}
    </button>
  );
});

function ScoreStack({
  rating,
  rt,
  audience,
  source = "imdb",
  placement = "bottom",
}: {
  rating?: string;
  rt?: number;
  audience?: number;
  source?: "imdb" | "mal";
  placement?: "top" | "bottom";
}) {
  const t = useT();
  if (!rating && rt == null && audience == null) return null;
  return (
    <div
      className={`absolute end-1.5 flex items-center gap-1 rounded-md bg-canvas/95 px-1.5 py-0.5 text-[10px] font-semibold text-ink ${
        placement === "top" ? "top-1.5" : "bottom-1.5"
      }`}
    >
      {rating && (
        <span className="flex items-center gap-1">
          {source === "mal" ? (
            <MalLogo className="h-[11px] w-auto text-ink-muted" />
          ) : (
            <ImdbIcon className="h-[11px] w-auto rounded-[2px]" />
          )}
          <span>{rating}</span>
        </span>
      )}
      {rating && rt != null && <span className="opacity-30">·</span>}
      {rt != null && (
        <span className="flex items-center gap-0.5">
          <RtBadge score={rt} className="h-[12px] w-auto" />
          <span>{rt}%</span>
        </span>
      )}
      {(rating || rt != null) && audience != null && <span className="opacity-30">·</span>}
      {audience != null && (
        <span className="flex items-center gap-0.5" title={t("Rotten Tomatoes audience score")}>
          <Popcorn size={12} strokeWidth={2.4} className={audience >= 60 ? "text-accent" : "text-ink-muted"} />
          <span>{Math.round(audience)}%</span>
        </span>
      )}
    </div>
  );
}

type BadgeTone = "default" | "accent";

function Badge({ label, tone = "default" }: { label: string; tone?: BadgeTone }) {
  const styles =
    tone === "accent"
      ? "bg-accent/90 text-canvas"
      : "border border-edge-soft bg-canvas/95 text-ink";
  return (
    <span
      className={`absolute start-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${styles}`}
    >
      {label}
    </span>
  );
}

function deriveBadge(meta: Meta): { label: string; tone?: BadgeTone } | null {
  const year = new Date().getFullYear();
  if (meta.releaseInfo === String(year)) return { label: "New" };
  return null;
}

function isInCinema(meta: Meta): boolean {
  return meta.type === "movie" && meta.inTheaters === true;
}

function isRerun(meta: Meta): boolean {
  if (meta.type !== "movie") return false;
  if (!meta.releaseDate) return false;
  const released = Date.parse(meta.releaseDate);
  if (Number.isNaN(released)) return false;
  const monthsOld = (Date.now() - released) / (1000 * 60 * 60 * 24 * 30.44);
  return monthsOld > 9;
}

const CR_CATEGORY_SHORT: Record<string, string> = {
  anime_of_the_year: "Winner",
  best_continuing_series: "Continuing",
  best_new_series: "New",
  best_film: "Film",
  best_original_anime: "Original",
  best_animation: "Animation",
  best_director: "Director",
  best_action: "Action",
  best_fantasy: "Fantasy",
  best_isekai: "Isekai",
  best_drama: "Drama",
  best_comedy: "Comedy",
  best_romance: "Romance",
  best_slice_of_life: "Slice",
  best_mystery: "Mystery",
  best_horror: "Horror",
  best_sports: "Sports",
  best_supernatural: "Supernatural",
  best_scifi: "Sci-Fi",
  best_background_art: "BG Art",
  best_character_design: "Char Design",
  best_cinematography: "Cinematography",
  best_art_direction: "Art Direction",
  best_score: "Score",
  best_song: "Song",
  best_opening: "Opening",
  best_ending: "Ending",
  best_boy: "Boy",
  best_girl: "Girl",
  best_protagonist: "Hero",
  best_antagonist: "Villain",
  best_main_character: "Main Char",
  best_supporting: "Supporting",
  best_couple: "Couple",
  best_fight: "Fight",
  best_bromance: "Bromance",
  best_girls_love: "GL",
  best_boys_love: "BL",
  must_protect: "Must Protect",
  global_impact: "Global Impact",
  best_cgi: "CGI",
  heartwarming_scene: "Heartwarming",
  // TAAF + Kobe specific
  best_tv: "TV",
  best_ova: "OVA",
  best_packaged: "Packaged",
  best_network: "Network",
  best_theme_song: "Song",
  // JMAF
  grand_prize: "Grand Prize",
  excellence: "Excellence",
  new_face: "New Face",
  social_impact: "Social",
  // r/anime
  best_short: "Short",
  best_va: "VA",
  best_character: "Character",
  best_adventure: "Adventure",
  best_suspense: "Suspense",
  best_psychological: "Psychological",
};

function AnimeAwardBadge({
  name,
  fallbackName,
  year,
  stacked,
}: {
  name: string;
  fallbackName?: string;
  year?: number;
  stacked: boolean;
}) {
  const t = useT();
  const win = findTopAward(name, year) ?? (fallbackName ? findTopAward(fallbackName, year) : null);
  if (!win) return null;
  const src = awardSourceMeta(win.source);
  const short = shortCategory(win);
  const label = stacked ? `${win.year}` : `${win.year} ${t(short)}`;
  return (
    <span
      className={`pointer-events-none absolute start-2 inline-flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-md bg-canvas/85 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink backdrop-blur-md ring-1 ring-edge-soft/60 ${
        stacked ? "top-[28px]" : "top-2"
      }`}
      title={`${src.name} · ${win.categoryName} (${win.year})`}
    >
      <img
        src={src.iconSmall}
        alt=""
        width={11}
        height={11}
        className={`h-2.5 w-2.5 shrink-0 object-contain ${win.source === "animation_kobe" ? "brightness-0 invert" : ""}`}
        draggable={false}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

function shortCategory(win: AwardWin): string {
  const fromMap = CR_CATEGORY_SHORT[win.categoryKey];
  if (fromMap) return fromMap;
  return win.categoryName.replace(/^Best\s+/i, "").replace(/Award$/i, "").trim();
}

function CinemaBadge() {
  const t = useT();
  return (
    <span className="harbor-cinema-badge absolute start-2 top-2 flex items-center gap-1 rounded-md bg-canvas/95 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em]">
      <ClapperMini size={10} />
      <span>{t("In Cinema")}</span>
    </span>
  );
}

function RerunBadge({ year }: { year?: string }) {
  const t = useT();
  return (
    <span className="absolute start-2 top-2 flex items-center gap-1 rounded-md border border-edge-soft bg-canvas/95 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-muted">
      <RefreshCcw size={9} strokeWidth={2.4} />
      <span>{t("Rerun")}{year ? ` · ${year}` : ""}</span>
    </span>
  );
}
