import { FolderPlus, HardDrive, Loader2, Play, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Poster, usePosterChain } from "@/components/poster";
import {
  addLocalEntries,
  parseFilename,
  removeLocalEntry,
  useLocalLibrary,
  type LocalEntry,
} from "@/lib/local-library";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { useT } from "@/lib/i18n";
import { FilterBar, Grid, type TypeKey } from "./shared";

export function LocalTab() {
  const t = useT();
  const items = useLocalLibrary();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ found: number; total: number } | null>(null);
  const { settings } = useSettings();

  const onAddFolder = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const folder = await open({ directory: true, multiple: false });
      if (typeof folder !== "string") {
        setBusy(false);
        return;
      }
      const { invoke } = await import("@tauri-apps/api/core");
      const scanned = (await invoke("harbor_scan_folder", { folder })) as Array<{
        path: string;
        filename: string;
        size: number;
      }>;
      if (scanned.length === 0) {
        setError(t("No video files found in that folder."));
        setBusy(false);
        return;
      }
      setProgress({ found: 0, total: scanned.length });
      const tmdbKey = settings.tmdbKey?.trim() || null;
      const entries: LocalEntry[] = [];
      for (let i = 0; i < scanned.length; i++) {
        const f = scanned[i];
        const parsed = parseFilename(f.filename);
        let tmdb: { tmdbId?: number; imdbId?: string; poster?: string } = {};
        if (tmdbKey) {
          tmdb = await tmdbLookup(tmdbKey, parsed.title, parsed.year, parsed.type).catch(() => ({}));
        }
        entries.push({
          id: hashPath(f.path),
          path: f.path,
          filename: f.filename,
          title: parsed.title,
          year: parsed.year,
          type: parsed.type,
          resolution: parsed.resolution,
          poster: tmdb.poster ?? null,
          tmdbId: tmdb.tmdbId ?? null,
          imdbId: tmdb.imdbId ?? null,
          addedAt: Date.now(),
        });
        setProgress({ found: i + 1, total: scanned.length });
      }
      addLocalEntries(entries);
      setProgress(null);
    } catch (e) {
      console.warn("[library] folder scan failed", e);
      setError(e instanceof Error ? e.message : t("Couldn't scan that folder."));
    } finally {
      setBusy(false);
    }
  }, [settings.tmdbKey]);

  const [type, setType] = useState<TypeKey>("all");
  const [query, setQuery] = useState("");
  const counts = useMemo(
    () => ({
      all: items.length,
      movie: items.filter((i) => i.type === "movie").length,
      series: items.filter((i) => i.type === "show").length,
    }),
    [items],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (type === "movie" && it.type !== "movie") return false;
      if (type === "series" && it.type !== "show") return false;
      if (q && !(it.title ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, type, query]);

  if (items.length === 0) {
    return (
      <EmptyOwned onAddFolder={onAddFolder} busy={busy} error={error} progress={progress} />
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <FilterBar
        type={type}
        setType={setType}
        query={query}
        setQuery={setQuery}
        counts={counts}
        trailing={
          <button
            type="button"
            onClick={onAddFolder}
            disabled={busy}
            className="ms-auto flex h-9 items-center gap-1.5 rounded-full bg-raised px-3.5 text-[12.5px] font-semibold text-ink-muted transition-colors hover:bg-elevated hover:text-ink disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <FolderPlus size={13} strokeWidth={2.2} />
            )}
            {busy ? scanLabel(progress, t) : t("Add folder")}
          </button>
        }
      />
      <span className="text-[12px] text-ink-muted">
        {items.length === 1
          ? t("{shown} of {total} file from your computer", { shown: visible.length, total: items.length })
          : t("{shown} of {total} files from your computer", { shown: visible.length, total: items.length })}
      </span>
      {error && (
        <p className="rounded-lg bg-danger/15 px-3 py-2 text-[12px] text-danger ring-1 ring-danger/30">
          {error}
        </p>
      )}
      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-edge-soft bg-canvas/30 px-6 py-10 text-center text-[13px] text-ink-muted">
          {t("No matches for these filters.")}
        </p>
      ) : (
        <Grid>
          {visible.map((it) => (
            <OwnedCard key={it.id} entry={it} />
          ))}
        </Grid>
      )}
    </section>
  );
}

function scanLabel(
  progress: { found: number; total: number } | null,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (!progress) return t("Scanning");
  return `${progress.found} / ${progress.total}`;
}

function EmptyOwned({
  onAddFolder,
  busy,
  error,
  progress,
}: {
  onAddFolder: () => void;
  busy: boolean;
  error: string | null;
  progress: { found: number; total: number } | null;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-edge-soft bg-canvas/30 px-8 py-16 text-center">
      <HardDrive size={32} strokeWidth={1.5} className="text-ink-subtle" />
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[18px] font-semibold text-ink">{t("Add files from your computer")}</h2>
        <p className="max-w-md text-[13px] leading-relaxed text-ink-muted">
          {t("Point Harbor at a folder. We scan it for movies and shows, parse titles from filenames, and enrich them with TMDB so they look the same as everything else here. We just remember the path; nothing is copied or moved.")}
        </p>
      </div>
      <button
        type="button"
        onClick={onAddFolder}
        disabled={busy}
        className="flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[13.5px] font-semibold text-canvas transition-colors hover:bg-ink/90 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <FolderPlus size={15} strokeWidth={2.2} />}
        {busy ? scanLabel(progress, t) : t("Choose folder")}
      </button>
      {error && (
        <p className="rounded-lg bg-danger/15 px-3 py-2 text-[12px] text-danger ring-1 ring-danger/30">
          {error}
        </p>
      )}
    </div>
  );
}

function OwnedCard({ entry }: { entry: LocalEntry }) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  const { openPlayer } = useView();
  const { settings } = useSettings();
  const poster = usePosterChain(
    settings.rpdbKey,
    entry.imdbId ?? `local:${entry.id}`,
    entry.poster ?? undefined,
    entry.type === "show" ? "series" : "movie",
  );

  const onPlay = useCallback(() => {
    openPlayer({
      meta: {
        id: entry.imdbId ?? `local:${entry.id}`,
        type: entry.type === "show" ? "series" : "movie",
        name: entry.title,
        poster: entry.poster ?? undefined,
        releaseInfo: entry.year ? String(entry.year) : undefined,
      },
      url: entry.path,
      title: entry.title,
      subtitle: entry.year ? String(entry.year) : entry.filename,
      notWebReady: true,
    });
  }, [entry, openPlayer]);

  return (
    <div
      className="group relative flex flex-col gap-2 text-start"
      onMouseLeave={() => setConfirm(false)}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onPlay}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPlay();
          }
        }}
        className="relative aspect-[2/3] cursor-pointer overflow-hidden rounded-xl bg-elevated shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)] outline-none ring-offset-2 ring-offset-canvas focus-visible:ring-2 focus-visible:ring-ink"
      >
        <Poster
          src={poster.src}
          onError={poster.onError}
          seed={entry.id}
          lazy
          className="h-full w-full transition-transform duration-200 group-hover:scale-[1.02]"
        />
        <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-md bg-canvas/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted backdrop-blur-sm">
          <HardDrive size={9} strokeWidth={2.4} />
          {entry.resolution ?? t("local")}
        </span>
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-canvas/55 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-canvas shadow-[0_4px_14px_rgba(0,0,0,0.45)]">
            <Play size={18} strokeWidth={2.4} fill="currentColor" className="ml-0.5" />
          </span>
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm) {
              removeLocalEntry(entry.id);
              setConfirm(false);
            } else {
              setConfirm(true);
            }
          }}
          className={`absolute end-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-white shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-all duration-200 ${
            confirm
              ? "bg-danger"
              : "bg-canvas/70 opacity-0 backdrop-blur-sm hover:bg-canvas/90 group-hover:opacity-100"
          }`}
          aria-label={confirm ? t("Confirm remove") : t("Remove from library")}
        >
          {confirm ? <RefreshCw size={11} strokeWidth={2.4} /> : <Trash2 size={11} strokeWidth={2.2} />}
        </button>
      </div>
      <button
        type="button"
        onClick={onPlay}
        className="text-start"
      >
        <p className="truncate text-[13px] font-medium text-ink transition-colors hover:text-accent" title={entry.filename}>
          {entry.title}
        </p>
        {entry.year != null && (
          <p className="-mt-1.5 truncate text-[11.5px] text-ink-subtle">
            {entry.year}
            {entry.type === "show" && t(" · Series")}
          </p>
        )}
      </button>
    </div>
  );
}

async function tmdbLookup(
  key: string,
  title: string,
  year: number | null,
  type: "movie" | "show",
): Promise<{ tmdbId?: number; imdbId?: string; poster?: string }> {
  const path = type === "movie" ? "movie" : "tv";
  const params = new URLSearchParams({ api_key: key, query: title });
  if (year && type === "movie") params.set("year", String(year));
  if (year && type === "show") params.set("first_air_date_year", String(year));
  const r = await fetch(`https://api.themoviedb.org/3/search/${path}?${params}`);
  if (!r.ok) return {};
  const json = await r.json();
  const top = json.results?.[0];
  if (!top) return {};
  return {
    tmdbId: top.id,
    poster: top.poster_path ? `https://image.tmdb.org/t/p/w342${top.poster_path}` : undefined,
  };
}

function hashPath(path: string): string {
  let hash = 5381;
  for (let i = 0; i < path.length; i++) {
    hash = ((hash << 5) + hash + path.charCodeAt(i)) | 0;
  }
  return `local-${(hash >>> 0).toString(36)}`;
}
