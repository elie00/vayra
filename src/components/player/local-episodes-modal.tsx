import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Play, Wifi, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useLocalLibrary, type LocalEntry } from "@/lib/local-library";
import { meta as fetchCinemetaMeta, type Meta } from "@/lib/cinemeta";
import {
  closeLocalEpisodes,
  getLocalEpisodes,
  subscribeLocalEpisodes,
  type LocalEpisodesPayload,
} from "@/lib/player/local-episodes-modal";

export function LocalEpisodesModal() {
  const state = useSyncExternalStore(subscribeLocalEpisodes, getLocalEpisodes);
  if (!state.open || !state.payload) return null;
  return <GridModal key={state.payload.tmdbId ?? state.payload.imdbId ?? state.payload.title} payload={state.payload} />;
}

type SeasonMap = Map<number, Map<number, LocalEntry>>;

function GridModal({ payload }: { payload: LocalEpisodesPayload }) {
  const t = useT();
  const { tmdbId, imdbId } = payload;
  const all = useLocalLibrary();

  const localEps = useMemo(
    () =>
      all
        .filter(
          (e) =>
            e.type === "show" &&
            ((tmdbId != null && e.tmdbId === tmdbId) || (imdbId != null && e.imdbId === imdbId)),
        )
        .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0)),
    [all, tmdbId, imdbId],
  );

  const [videos, setVideos] = useState<Meta["videos"] | undefined>(payload.videos);
  useEffect(() => {
    if (videos && videos.length > 0) return;
    if (!imdbId || !imdbId.startsWith("tt")) return;
    let alive = true;
    void fetchCinemetaMeta("series", imdbId)
      .then((full) => {
        if (alive && full?.videos?.length) setVideos(full.videos);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [imdbId, videos]);

  const localBySeason = useMemo<SeasonMap>(() => {
    const m: SeasonMap = new Map();
    for (const e of localEps) {
      if (e.season == null || e.episode == null) continue;
      if (!m.has(e.season)) m.set(e.season, new Map());
      m.get(e.season)!.set(e.episode, e);
    }
    return m;
  }, [localEps]);

  const seasonEpisodeCount = useMemo<Map<number, number>>(() => {
    const m = new Map<number, number>();
    if (videos) {
      for (const v of videos) {
        if (v.season == null || v.episode == null) continue;
        m.set(v.season, Math.max(m.get(v.season) ?? 0, v.episode));
      }
    }
    for (const [season, eps] of localBySeason) {
      const localMax = Math.max(...eps.keys());
      m.set(season, Math.max(m.get(season) ?? 0, localMax));
    }
    return m;
  }, [videos, localBySeason]);

  const episodeNames = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>();
    if (videos) {
      for (const v of videos) {
        if (v.season == null || v.episode == null) continue;
        const name = v.name || v.title;
        if (name) m.set(`${v.season}x${v.episode}`, name);
      }
    }
    return m;
  }, [videos]);

  const gridSeasons = useMemo(
    () => Array.from(seasonEpisodeCount.keys()).filter((s) => s > 0).sort((a, b) => a - b),
    [seasonEpisodeCount],
  );
  const globalMax = useMemo(
    () => Math.max(1, ...gridSeasons.map((s) => seasonEpisodeCount.get(s) ?? 0)),
    [gridSeasons, seasonEpisodeCount],
  );

  const localSeasons = useMemo(
    () => Array.from(localBySeason.keys()).filter((s) => s > 0).sort((a, b) => a - b),
    [localBySeason],
  );
  const hasSpecials = localBySeason.has(0);

  const initialSeason =
    payload.initialSeason != null && localBySeason.has(payload.initialSeason)
      ? payload.initialSeason
      : localSeasons[0] ?? (hasSpecials ? 0 : 1);
  const [selected, setSelected] = useState<number>(initialSeason);
  useEffect(() => {
    const valid = selected === 0 ? hasSpecials : localSeasons.includes(selected);
    if (!valid) setSelected(localSeasons[0] ?? (hasSpecials ? 0 : 1));
  }, [localSeasons, hasSpecials, selected]);

  const listEps = useMemo(
    () =>
      Array.from(localBySeason.get(selected)?.values() ?? []).sort(
        (a, b) => (a.episode ?? 0) - (b.episode ?? 0),
      ),
    [localBySeason, selected],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeLocalEpisodes();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const play = (ep: LocalEntry) => {
    const fn = payload.onPlayLocal;
    closeLocalEpisodes();
    fn(ep);
  };
  const stream = () => {
    const fn = payload.onStream;
    closeLocalEpisodes();
    fn?.();
  };

  const cols = Array.from({ length: globalMax }, (_, i) => i + 1);
  const seasonLabel = (s: number) => (s === 0 ? t("Specials") : `S${String(s).padStart(2, "0")}`);

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[210] flex items-center justify-center bg-canvas/80 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeLocalEpisodes();
      }}
    >
      <div className="animate-modal-in flex max-h-[86vh] w-[min(94vw,600px)] flex-col rounded-2xl border border-edge-soft bg-elevated shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-3 border-b border-edge-soft px-5 pb-3.5 pt-4">
          {payload.poster && (
            <img
              src={payload.poster}
              alt=""
              className="h-11 w-8 shrink-0 rounded-md object-cover ring-1 ring-edge-soft"
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="truncate font-display text-[18px] font-medium text-ink" title={payload.title}>
              {payload.title}
            </h2>
            <span className="text-[12px] text-ink-subtle">
              {localEps.length === 1 ? t("1 episode on disk") : t("{n} episodes on disk", { n: localEps.length })}
            </span>
          </div>
          <button
            type="button"
            onClick={() => closeLocalEpisodes()}
            aria-label={t("Close")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-raised hover:text-ink"
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <div className="mx-auto w-fit max-w-full shrink-0 rounded-xl border border-edge-soft bg-canvas p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
              {t("Availability")}
            </p>
            <div className="max-h-[220px] overflow-auto">
              <table className="border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="sticky start-0 top-0 z-20 bg-canvas" />
                    {cols.map((c) => (
                      <th
                        key={c}
                        className="sticky top-0 z-10 w-7 bg-canvas pb-0.5 text-center text-[10px] font-semibold tabular-nums text-ink-subtle"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gridSeasons.map((s) => {
                    const count = seasonEpisodeCount.get(s) ?? 0;
                    const owned = localBySeason.get(s);
                    return (
                      <tr key={s}>
                        <td className="sticky start-0 z-10 bg-canvas pe-2">
                          <span className="flex h-6 min-w-[40px] items-center justify-center rounded-md bg-elevated px-2 font-mono text-[11px] font-bold tabular-nums text-ink-muted ring-1 ring-edge-soft">
                            {seasonLabel(s)}
                          </span>
                        </td>
                        {cols.map((c) => {
                          if (c > count) return <td key={c} className="h-7 w-7" />;
                          const isLocal = owned?.has(c) ?? false;
                          return (
                            <td key={c} className="h-7 w-7">
                              <span className="flex h-full w-full items-center justify-center">
                                <span
                                  className={
                                    isLocal
                                      ? "h-3 w-3 rounded-full bg-accent"
                                      : "h-3 w-3 rounded-full ring-1 ring-inset ring-edge"
                                  }
                                  title={
                                    isLocal
                                      ? `${seasonLabel(s)}E${String(c).padStart(2, "0")} · ${t("on disk")}`
                                      : `${seasonLabel(s)}E${String(c).padStart(2, "0")} · ${t("not downloaded")}`
                                  }
                                />
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {(localSeasons.length > 1 || hasSpecials) && (
            <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto pb-1">
              {localSeasons.map((s) => (
                <SeasonPill key={s} active={selected === s} onClick={() => setSelected(s)}>
                  {seasonLabel(s)}
                </SeasonPill>
              ))}
              {hasSpecials && (
                <SeasonPill active={selected === 0} onClick={() => setSelected(0)}>
                  {t("Specials")}
                </SeasonPill>
              )}
            </div>
          )}

          <div className="flex shrink-0 flex-col gap-1">
            {listEps.map((ep) => (
              <button
                key={ep.id}
                type="button"
                onClick={() => play(ep)}
                className={`group/ep flex items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-raised ${
                  payload.highlightEpisode === ep.episode && payload.initialSeason === ep.season
                    ? "bg-accent/10 ring-1 ring-accent"
                    : ""
                }`}
              >
                <span className="flex h-8 w-11 shrink-0 items-center justify-center rounded-md bg-canvas/60 font-mono text-[12px] font-bold tabular-nums text-ink-muted ring-1 ring-edge-soft">
                  {`E${String(ep.episode ?? 0).padStart(2, "0")}`}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] text-ink" title={ep.filename}>
                    {episodeNames.get(`${ep.season}x${ep.episode}`) ?? ep.filename}
                  </span>
                  {episodeNames.has(`${ep.season}x${ep.episode}`) && (
                    <span className="truncate text-[11px] text-ink-subtle" title={ep.filename}>
                      {ep.filename}
                    </span>
                  )}
                </span>
                {ep.resolution && (
                  <span className="shrink-0 rounded-md bg-raised px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    {ep.resolution}
                  </span>
                )}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors group-hover/ep:bg-ink group-hover/ep:text-canvas">
                  <Play size={13} strokeWidth={2.4} fill="currentColor" className="ml-0.5" />
                </span>
              </button>
            ))}
            {listEps.length === 0 && (
              <p className="px-3 py-6 text-center text-[13px] text-ink-subtle">
                {t("No local episodes in this season.")}
              </p>
            )}
          </div>
        </div>

        {payload.onStream && (
          <div className="border-t border-edge-soft p-4">
            <button
              type="button"
              onClick={stream}
              className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full bg-canvas/50 text-[13.5px] font-semibold text-ink ring-1 ring-edge-soft transition-colors hover:bg-canvas/70"
            >
              <Wifi size={16} strokeWidth={2.2} />
              {t("Stream / addons instead")}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function SeasonPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
        active ? "bg-ink text-canvas" : "bg-elevated/40 text-ink-muted ring-1 ring-edge-soft/60 hover:bg-raised hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
