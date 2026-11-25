import { HardDrive, Play, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Row } from "@/components/row";
import { meta as fetchMeta, narrowMediaType, type Meta } from "@/lib/cinemeta";
import { useContextMenu } from "@/lib/context-menu";
import { useT } from "@/lib/i18n";
import { peekCachedLogo, resolveLogo } from "@/lib/logo";
import { useLuma, lumaStore, type LumaResumeEntry } from "@/lib/luma";
import { lumaResumeEpisode, lumaResumeMeta, resolveLumaResumeTarget } from "@/lib/luma/resume-target";
import { animeKitsuMeta } from "@/lib/providers/anime-kitsu-addon";
import { tmdbLiteMeta } from "@/lib/providers/tmdb/tmdb-lite";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";

function downscaleTmdb(url?: string): string | undefined {
  if (!url) return url;
  return url.replace(/\/t\/p\/(original|w1280|w780|w500)\//, "/t/p/w300/");
}

function formatRemaining(
  t: (key: string, vars?: Record<string, string | number>) => string,
  ms: number,
): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return t("{m}m left", { m: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? t("{h}h left", { h }) : t("{h}h {m}m left", { h, m });
}

export function LumaResumeCard({
  entry,
  announce,
}: {
  entry: LumaResumeEntry;
  announce: (message: string) => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const { openMeta, openPicker, openPlayer } = useView();
  const { open: openContextMenu } = useContextMenu();

  const progress = entry.durationMs > 0 ? Math.max(0, Math.min(1, entry.positionMs / entry.durationMs)) : 0;
  const remaining = entry.durationMs > 0 ? formatRemaining(t, Math.max(0, entry.durationMs - entry.positionMs)) : "";
  const episode = lumaResumeEpisode(entry);
  const sub = episode ? `S${episode.season}E${episode.episode}` : "";
  const episodeTitle = entry.presentation.episodeTitle?.trim() || null;

  const catalogRef = entry.ref.kind === "catalog" ? entry.ref : null;
  const [logo, setLogo] = useState<string | undefined>();
  const [metaBg, setMetaBg] = useState<string | undefined>();
  const [hydratedMeta, setHydratedMeta] = useState<Meta | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const cardRef = useRef<HTMLButtonElement>(null);

  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of [entry.presentation.artwork, metaBg, hydratedMeta?.background, hydratedMeta?.poster]) {
      if (!u) continue;
      const d = downscaleTmdb(u)!;
      if (seen.has(d)) continue;
      seen.add(d);
      out.push(d);
    }
    return out;
  }, [entry.presentation.artwork, metaBg, hydratedMeta?.background, hydratedMeta?.poster]);

  const src = candidates[imgIdx];

  useEffect(() => {
    setLogo(undefined);
    setMetaBg(undefined);
    setHydratedMeta(null);
    setImgIdx(0);
    if (!catalogRef) return;
    const el = cardRef.current;
    if (!el) return;
    let cancelled = false;
    let started = false;
    const metaId = catalogRef.metaId;
    const mediaType = catalogRef.mediaType;
    const title = entry.presentation.title;
    const artwork = entry.presentation.artwork;

    const resolveOfficialLogo = (m: Meta) => {
      const key = settingsRef.current.tmdbKey;
      const cached = peekCachedLogo(key, m);
      if (cached) {
        setLogo(cached);
        return;
      }
      void resolveLogo(key, m)
        .then((l) => {
          if (!cancelled && l) setLogo(l);
        })
        .catch(() => {});
    };

    const start = () => {
      if (started) return;
      started = true;
      if (/^(kitsu|mal|anilist|anidb):/.test(metaId)) {
        animeKitsuMeta(metaId)
          .then((m) => {
            if (cancelled || !m) return;
            const nextMeta: Meta = {
              id: metaId,
              type: mediaType,
              name: m.name?.trim() ? m.name : title,
              poster: m.poster,
              background: m.background,
              logo: m.logo,
            };
            setHydratedMeta(nextMeta);
            if (m.logo) setLogo(m.logo);
            else resolveOfficialLogo(nextMeta);
            const bg = m.background || (artwork ? undefined : m.poster);
            if (bg) setMetaBg(bg);
          })
          .catch(() => {});
        return;
      }
      if (metaId.startsWith("tmdb:")) {
        tmdbLiteMeta(settingsRef.current.tmdbKey, metaId)
          .then((m) => {
            if (cancelled || !m) return;
            const nextMeta: Meta = {
              id: metaId,
              type: mediaType,
              name: m.name?.trim() ? m.name : title,
              poster: m.poster ?? artwork,
              background: m.background ?? artwork,
            };
            setHydratedMeta(nextMeta);
            resolveOfficialLogo(nextMeta);
            const bg = m.background || (artwork ? undefined : m.poster);
            if (bg) setMetaBg(bg);
          })
          .catch(() => {});
        return;
      }
      fetchMeta(narrowMediaType(mediaType), metaId)
        .then((full) => {
          if (cancelled || !full) return;
          setHydratedMeta(full);
          resolveOfficialLogo(full);
          const bg = full.background || (artwork ? undefined : full.poster);
          if (bg) setMetaBg(bg);
        })
        .catch(() => {});
    };

    if (typeof IntersectionObserver === "undefined") {
      start();
      return () => {
        cancelled = true;
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          start();
          io.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [catalogRef, entry.presentation.title, entry.presentation.artwork]);

  const baseMeta = useMemo(() => lumaResumeMeta(entry), [entry]);
  const meta: Meta = hydratedMeta
    ? { ...hydratedMeta, id: baseMeta.id, type: baseMeta.type }
    : baseMeta;
  const displayTitle = hydratedMeta?.name?.trim() || entry.presentation.title;

  const resume = () => {
    const target = resolveLumaResumeTarget(entry);
    if (target.kind === "missing-local") {
      lumaStore().clearResume(entry.id);
      announce(t("This local file is no longer in your library."));
      return;
    }
    if (target.kind === "local") {
      openPlayer(target.player);
      return;
    }
    openPicker(target.meta, target.episode, { autoPlay: true, resume: true });
  };

  const onCardClick = () => {
    if (catalogRef) {
      openMeta(meta, episode ? { episodeHint: { season: episode.season, episode: episode.episode } } : undefined);
      return;
    }
    resume();
  };

  return (
    <article className="group relative w-full min-w-0">
      <button
        ref={cardRef}
        type="button"
        onClick={onCardClick}
        onContextMenu={catalogRef ? (e) => openContextMenu(e, { kind: "meta", meta }) : undefined}
        className="flex w-full min-w-0 flex-col gap-2.5 text-start"
      >
        <div className="harbor-poster relative aspect-[16/9] overflow-hidden rounded-xl bg-elevated shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] will-change-transform [transform:translate3d(0,0,0)] transition-transform duration-[220ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
          <div className="absolute inset-0 bg-gradient-to-br from-raised via-elevated to-surface" />
          {src ? (
            <img
              key={src}
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setImgIdx((i) => i + 1)}
              className="absolute inset-0 h-full w-full object-cover brightness-95"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-elevated text-ink-muted">
              <HardDrive size={24} />
            </div>
          )}
          <div className="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.45)]" />
          {logo && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
              <img
                src={logo}
                alt=""
                loading="lazy"
                decoding="async"
                className="max-h-[55%] w-auto max-w-[78%] object-contain opacity-80 transition-opacity duration-[220ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:opacity-25 motion-reduce:transition-none"
              />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-canvas/80 to-transparent" />
          {(sub || remaining || episodeTitle) && (
            <div className="absolute bottom-2 start-2 flex max-w-[calc(100%-16px)] items-center gap-1.5 rounded-md bg-canvas/95 px-2 py-1 text-[11px]">
              <Play size={11} fill="currentColor" className="shrink-0 text-ink" />
              {sub && <span className="shrink-0 font-medium text-ink">{sub}</span>}
              {episodeTitle ? (
                <>
                  {sub && <span className="shrink-0 text-ink-subtle">·</span>}
                  <span className="min-w-0 truncate text-ink-muted">{episodeTitle}</span>
                </>
              ) : (
                remaining && (
                  <>
                    {sub && <span className="shrink-0 text-ink-subtle">·</span>}
                    <span className="shrink-0 text-ink-muted">{remaining}</span>
                  </>
                )
              )}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-canvas/40" aria-hidden="true">
            <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <p className="truncate text-[13px] font-medium text-ink">{displayTitle}</p>
      </button>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex aspect-[16/9] items-center justify-center opacity-0 transition-opacity duration-[220ms] group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            resume();
          }}
          aria-label={t("Resume {title} with LUMA", { title: displayTitle })}
          title={t("Play")}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-canvas ring-1 ring-white/15 shadow-[0_10px_28px_-8px_rgba(0,0,0,0.6)] transition-transform duration-150 hover:scale-[1.06] motion-reduce:transition-none"
        >
          <Play size={22} fill="currentColor" className="ml-0.5 text-ink" />
        </button>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          lumaStore().clearResume(entry.id);
        }}
        aria-label={t("Remove {title} from LUMA history", { title: displayTitle })}
        className="group/x absolute end-0.5 top-0.5 z-10 flex h-11 w-11 items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-canvas/85 text-ink-muted ring-1 ring-white/12 backdrop-blur-sm transition-colors group-hover/x:bg-canvas group-hover/x:text-ink">
          <X size={20} strokeWidth={2.4} />
        </span>
      </button>
    </article>
  );
}

export function LumaResumeSection({ title }: { title?: string } = {}) {
  const t = useT();
  const snapshot = useLuma();
  const [announcement, setAnnouncement] = useState("");
  if (!snapshot.document.preferences.rememberActivity || snapshot.document.resumes.length === 0) return null;

  return (
    <section aria-label={t("Resume with LUMA")}>
      <Row
        title={title ?? t("Resume with LUMA")}
        titleExtra={<span className="inline-flex items-center gap-1.5 rounded-full border border-edge-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle"><ShieldCheck size={11} />{t("Local only")}</span>}
        min={260}
        shape="landscape"
        scrollKey="home:luma:resume"
      >
        {snapshot.document.resumes.map((entry) => <LumaResumeCard key={entry.id} entry={entry} announce={setAnnouncement} />)}
      </Row>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </section>
  );
}
