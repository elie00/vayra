import { Loader2, Star, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { animeDetails } from "@/lib/providers/anime-detail";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { activeLayout } from "@/lib/theme";
import { IMG } from "@/lib/providers/tmdb/tmdb-client";
import { tmdbDetails, type CastEntry, type TmdbDetail } from "@/lib/providers/tmdb/tmdb-details";

function isAnimeId(id: string): boolean {
  return id.startsWith("kitsu:") || id.startsWith("mal:") || id.startsWith("anilist:");
}

export function CastModal({
  open,
  onClose,
  meta,
  tmdbKey,
}: {
  open: boolean;
  onClose: () => void;
  meta: Meta;
  tmdbKey: string | null;
}) {
  const t = useT();
  const { settings } = useSettings();
  const [detail, setDetail] = useState<TmdbDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const anime = isAnimeId(meta.id);

  useEffect(() => {
    if (!open) return;
    if (!anime && !tmdbKey) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const fetch: Promise<TmdbDetail | null> = anime
      ? animeDetails(settings, meta).then((r) => r?.detail ?? null)
      : tmdbDetails(tmdbKey as string, meta);
    fetch
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tmdbKey, meta, anime, settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const title = detail?.title ?? meta.name;
  const detailPoster = detail?.poster
    ? detail.poster.startsWith("http")
      ? detail.poster
      : `${IMG}/w342${detail.poster}`
    : null;
  const poster = detailPoster ?? meta.poster;
  const overview = detail?.overview?.trim() || meta.description?.trim() || "";
  const year = detail?.year ?? meta.releaseInfo ?? meta.releaseDate?.slice(0, 4) ?? "";
  const rating = detail?.rating ?? meta.imdbRating ?? "";
  const runtime = detail?.runtime ?? meta.runtime ?? "";
  const genres = (detail?.genres?.length ? detail.genres : meta.genres) ?? [];

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[60] flex items-center justify-center bg-black/72 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-edge bg-elevated shadow-[0_28px_72px_-20px_rgba(0,0,0,0.85)] animate-in zoom-in-95 fade-in duration-200 backdrop-blur-xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-edge-soft px-6 py-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-ink-subtle">
              {t("About this title")}
            </span>
            <span className="text-[15px] font-medium text-ink">
              {meta.type === "series" ? t("Series") : t("Movie")}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-raised text-ink-muted transition-colors hover:bg-canvas/55 hover:text-ink"
            aria-label={t("Close")}
          >
            <X size={18} strokeWidth={2.2} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <Header
            title={title}
            poster={poster}
            fallback={meta.poster}
            year={year}
            rating={rating}
            runtime={runtime}
            genres={genres}
            overview={overview}
          />

          {detail && (detail.directors.length > 0 || detail.writers.length > 0) && (
            <CrewRows directors={detail.directors} writers={detail.writers} />
          )}

          <div className="flex items-center gap-2 border-t border-edge-soft px-6 pt-4 pb-2">
            <Users size={14} strokeWidth={2.2} className="text-ink-subtle" />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-ink-subtle">
              {t("Cast")}
            </span>
            {loading && <Loader2 size={13} className="animate-spin text-ink-subtle" />}
          </div>

          {detail && detail.cast.length > 0 ? (
            <CastStrip cast={detail.cast} />
          ) : !anime && !tmdbKey ? (
            <div className="px-6 pb-5 text-[13.5px] leading-relaxed text-ink-muted">
              {t("Add a TMDB key in Settings to see the cast for every title.")}
            </div>
          ) : !loading ? (
            <div className="px-6 pb-5 text-[13.5px] leading-relaxed text-ink-muted">
              {t("Cast information isn't available for this title.")}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Header({
  title,
  poster,
  fallback,
  year,
  rating,
  runtime,
  genres,
  overview,
}: {
  title: string;
  poster: string | undefined;
  fallback: string | undefined;
  year: string | undefined;
  rating: string | undefined;
  runtime: string | undefined;
  genres: string[];
  overview: string;
}) {
  const { settings } = useSettings();
  const [imgSrc, setImgSrc] = useState(poster);
  useEffect(() => setImgSrc(poster), [poster]);
  const ratingClass =
    activeLayout(settings.theme) === "stremio" ? "text-amber-400" : "text-accent";
  const facts: React.ReactNode[] = [];
  if (year) facts.push(<span key="year">{year}</span>);
  if (rating) {
    facts.push(
      <span key="rating" className={`inline-flex items-center gap-1 ${ratingClass}`}>
        <Star size={12} strokeWidth={2.4} fill="currentColor" />
        {rating}
      </span>,
    );
  }
  if (runtime) facts.push(<span key="run">{runtime}</span>);
  return (
    <div className="flex gap-5 px-6 pt-5 pb-4">
      {imgSrc && (
        <img
          src={imgSrc}
          alt=""
          onError={() => {
            if (fallback && imgSrc !== fallback) setImgSrc(fallback);
          }}
          className="h-44 w-28 shrink-0 rounded-lg object-cover ring-1 ring-edge-soft"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 className="text-[20px] font-semibold leading-tight text-ink">{title}</h2>
        {facts.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] font-medium text-ink-muted">
            {facts.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-3">
                {i > 0 && <span className="text-ink-subtle">·</span>}
                {f}
              </span>
            ))}
          </div>
        )}
        {genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {genres.slice(0, 5).map((g) => (
              <span
                key={g}
                className="rounded-full bg-raised px-2.5 py-1 text-[11.5px] font-medium text-ink-muted"
              >
                {g}
              </span>
            ))}
          </div>
        )}
        {overview && (
          <p className="pt-1 text-[14px] leading-relaxed text-ink-muted">{overview}</p>
        )}
      </div>
    </div>
  );
}

function CrewRows({
  directors,
  writers,
}: {
  directors: TmdbDetail["directors"];
  writers: TmdbDetail["writers"];
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1 border-t border-edge-soft bg-canvas/30 px-6 py-3">
      {directors.length > 0 && (
        <div className="flex items-baseline gap-2 text-[13px]">
          <span className="w-20 shrink-0 text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-subtle">
            {t("Director")}
          </span>
          <span className="text-ink">{directors.map((p) => p.name).join(", ")}</span>
        </div>
      )}
      {writers.length > 0 && (
        <div className="flex items-baseline gap-2 text-[13px]">
          <span className="w-20 shrink-0 text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-subtle">
            {t("Writer")}
          </span>
          <span className="text-ink">
            {writers
              .slice(0, 4)
              .map((p) => p.name)
              .join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}

function CastStrip({ cast }: { cast: CastEntry[] }) {
  const top = cast.slice().sort((a, b) => a.order - b.order).slice(0, 24);
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3 px-6 pb-6">
      {top.map((c) => (
        <div key={c.id} className="flex flex-col items-center gap-1.5 text-center">
          {c.profilePath ? (
            <img
              src={`${IMG}/w185${c.profilePath}`}
              alt=""
              loading="lazy"
              className="h-20 w-20 rounded-full object-cover ring-1 ring-edge-soft"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-raised text-[18px] font-semibold text-ink-subtle ring-1 ring-edge-soft">
              {initials(c.name)}
            </div>
          )}
          <span className="line-clamp-2 text-[12.5px] font-medium leading-tight text-ink">
            {c.name}
          </span>
          {c.character && (
            <span className="line-clamp-2 text-[11.5px] leading-tight text-ink-subtle">
              {c.character}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
