import {
  AlertTriangle,
  ArrowDownUp,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Check,
  CheckSquare,
  ChevronDown,
  Download,
  FlipHorizontal2,
  FolderPlus,
  HardDrive,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Trash2,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Poster } from "@/components/poster";
import { effectiveTmdbLanguage } from "@/lib/providers/tmdb/tmdb-client";
import { imageRequestLang } from "@/lib/providers/tmdb/tmdb-image-lang";
import { useLocalPoster } from "./local-tab/use-local-poster";
import {
  addLocalEntries,
  localEntryToMeta,
  parseFilename,
  removeLocalEntry,
  updateLocalEntries,
  updateLocalEntry,
  useLocalLibrary,
  type LocalEntry,
} from "@/lib/local-library";
import {
  clearSidecarCache,
  countNfoFor,
  findLocalArt,
  findNfo,
  findShowArt,
  findShowNfo,
  readNfo,
} from "@/lib/local-library/sidecars";
import { exportMovie, exportSeries, type ExportSizes } from "@/lib/local-library/export";
import { confirmDialog } from "@/lib/dialog";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { useT } from "@/lib/i18n";
import { LocalBadge } from "@/components/local-badge";
import { FilterBar, Grid, type TypeKey } from "./shared";
import {
  episodeLabel,
  groupLocal,
  localPlayerSrc,
  ShowGroupCard,
  type LocalGroup,
} from "./local-tab/show-group";
import { ScanModeModal, type ScanMode } from "./local-tab/scan-mode-modal";
import { IdentifyModal, type IdentifyResolution } from "./local-tab/identify-modal";
import { CardIconButton, type LocalCardProps } from "./local-tab/card-actions";

type ScannedFile = { path: string; filename: string; size: number };
type PendingScan = { folder: string; files: ScannedFile[]; nfoCount: number };

type Tr = (key: string, vars?: Record<string, string | number>) => string;

type LocalSortKey = "added" | "title" | "year" | "rating" | "runtime";
type SortDir = "asc" | "desc";

// The entry that represents a card for sorting (the movie, or a series' head),
// plus the group's effective "date added" (most recently added episode).
function groupSortEntry(g: LocalGroup): { entry: LocalEntry; added: number } {
  if (g.kind === "movie") return { entry: g.entry, added: g.entry.addedAt };
  return { entry: g.head, added: Math.max(...g.episodes.map((e) => e.addedAt)) };
}

// Sort grouped cards by the chosen field/direction. Titles compare
// alphabetically; numeric fields sort with missing values always last so absent
// ratings/durations never dominate the top of the list.
function sortGroups(groups: LocalGroup[], key: LocalSortKey, dir: SortDir): LocalGroup[] {
  const mul = dir === "asc" ? 1 : -1;
  const decorated = groups.map((g) => ({ g, ...groupSortEntry(g) }));
  decorated.sort((a, b) => {
    if (key === "title") {
      return mul * (a.entry.title ?? "").localeCompare(b.entry.title ?? "", undefined, { sensitivity: "base" });
    }
    // When sorting by duration, TV shows (per-episode runtime) always rank above
    // movies (feature-length) regardless of direction; runtime orders within each.
    if (key === "runtime") {
      const ra = a.g.kind === "show" ? 0 : 1;
      const rb = b.g.kind === "show" ? 0 : 1;
      if (ra !== rb) return ra - rb;
    }
    const pick = (e: LocalEntry, added: number): number | null =>
      key === "year" ? e.year ?? null : key === "rating" ? e.rating ?? null : key === "runtime" ? e.runtime ?? null : added;
    const av = pick(a.entry, a.added);
    const bv = pick(b.entry, b.added);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return mul * (av - bv);
  });
  return decorated.map((d) => d.g);
}

export function LocalTab() {
  const t = useT();
  const { openMeta } = useView();
  const items = useLocalLibrary();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ found: number; total: number } | null>(null);
  const [pending, setPending] = useState<PendingScan | null>(null);
  const [identify, setIdentify] = useState<LocalEntry[] | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const { settings } = useSettings();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const exportSizes: ExportSizes = useMemo(
    () => ({
      poster: settings.nfoPosterSize,
      backdrop: settings.nfoBackdropSize,
      logo: settings.nfoLogoSize,
    }),
    [settings.nfoPosterSize, settings.nfoBackdropSize, settings.nfoLogoSize],
  );

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
      const scanned = (await invoke("harbor_scan_folder", { folder })) as ScannedFile[];
      if (scanned.length === 0) {
        setError(t("No video files found in that folder."));
        setBusy(false);
        return;
      }
      clearSidecarCache();
      const nfoCount = await countNfoFor(scanned.map((f) => f.path));
      setBusy(false);
      setPending({ folder, files: scanned, nfoCount });
    } catch (e) {
      console.warn("[library] folder scan failed", e);
      setError(e instanceof Error ? e.message : t("Couldn't scan that folder."));
      setBusy(false);
    }
  }, [t]);

  const runScan = useCallback(
    async (files: ScannedFile[], mode: ScanMode) => {
      setBusy(true);
      setError(null);
      setProgress({ found: 0, total: files.length });
      const tmdbKey = settings.tmdbKey?.trim() || null;
      const entries: LocalEntry[] = [];
      try {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const parsed = parseFilename(f.filename);
          const built =
            mode === "nfo"
              ? await buildNfoEntry(f, parsed, tmdbKey)
              : await buildTmdbEntry(f, parsed, tmdbKey);
          entries.push(built);
          setProgress({ found: i + 1, total: files.length });
        }
        addLocalEntries(entries);
      } catch (e) {
        console.warn("[library] scan failed", e);
        setError(e instanceof Error ? e.message : t("Couldn't scan that folder."));
      } finally {
        setProgress(null);
        setBusy(false);
      }
    },
    [settings.tmdbKey, t],
  );

  const onPickMode = useCallback(
    (mode: ScanMode) => {
      const files = pending?.files ?? [];
      setPending(null);
      if (files.length) void runScan(files, mode);
    },
    [pending, runScan],
  );

  const onResolveIdentify = useCallback((ids: string[], res: IdentifyResolution) => {
    updateLocalEntries(ids, {
      tmdbId: res.tmdbId,
      imdbId: res.imdbId,
      poster: res.poster,
      title: res.title,
      year: res.year,
      type: res.type,
      needsReview: false,
    });
  }, []);

  // Export a batch: movies write a stem .nfo + stem-prefixed artwork next to the
  // file; each series writes one tvshow.nfo + artwork at the show root plus a
  // per-episode .nfo. Reports how many titles succeeded/failed.
  const runExport = useCallback(
    async (entries: LocalEntry[]): Promise<{ ok: number; fail: number; reason?: string }> => {
      const key = settings.tmdbKey?.trim();
      if (!key) {
        setToast(t("Add a TMDB key to export metadata."));
        return { ok: 0, fail: 0 };
      }
      const movies = entries.filter((e) => e.type === "movie" && e.tmdbId != null);
      const showGroups = new Map<string, LocalEntry[]>();
      for (const e of entries) {
        if (e.type !== "show" || e.tmdbId == null) continue;
        const gk = `t${e.tmdbId}`;
        let arr = showGroups.get(gk);
        if (!arr) {
          arr = [];
          showGroups.set(gk, arr);
        }
        arr.push(e);
      }
      const total = movies.length + showGroups.size;
      let ok = 0;
      let fail = 0;
      let done = 0;
      let reason: string | undefined;
      for (const m of movies) {
        setToast(t("Exporting {done}/{total}…", { done: ++done, total }));
        const res = await exportMovie(key, m, exportSizes);
        if (res.ok) {
          ok += 1;
          if (res.localArt) updateLocalEntry(m.id, { localArt: res.localArt });
        } else {
          fail += 1;
          reason = reason ?? res.reason;
        }
      }
      for (const eps of showGroups.values()) {
        setToast(t("Exporting {done}/{total}…", { done: ++done, total }));
        const res = await exportSeries(key, eps, exportSizes);
        if (res.ok) {
          ok += 1;
          if (res.localArt) updateLocalEntries(eps.map((e) => e.id), { localArt: res.localArt });
        } else {
          fail += 1;
          reason = reason ?? res.reason;
        }
      }
      return { ok, fail, reason };
    },
    [settings.tmdbKey, exportSizes, t],
  );

  const onExportOne = useCallback(
    async (entryOrList: LocalEntry | LocalEntry[]) => {
      const list = (Array.isArray(entryOrList) ? entryOrList : [entryOrList]).filter(
        (e) => e.tmdbId != null,
      );
      if (list.length === 0) {
        setToast(t("Identify this title before exporting."));
        return;
      }
      const { ok, fail, reason } = await runExport(list);
      setToast(
        fail === 0
          ? t("Saved .nfo and artwork")
          : ok === 0
            ? t("Export failed: {reason}", { reason: reason ?? t("unknown error") })
            : t("Exported {ok}, {fail} failed", { ok, fail }),
      );
    },
    [runExport, t],
  );

  const toggleSelect = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = ids.every((id) => next.has(id));
      if (allIn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const bulkDelete = useCallback(async () => {
    if (selected.size === 0) return;
    const n = selected.size;
    const ok = await confirmDialog(
      t("Remove {n} items from your library? Files on your disk are not deleted.", { n }),
    );
    if (!ok) return;
    selected.forEach((id) => removeLocalEntry(id));
    exitSelect();
  }, [selected, exitSelect, t]);

  const bulkExport = useCallback(async () => {
    const list = items.filter((i) => selected.has(i.id) && i.tmdbId != null);
    if (list.length === 0) {
      setToast(t("Select identified titles to export."));
      return;
    }
    const { ok, fail, reason } = await runExport(list);
    setToast(
      fail === 0
        ? t("Exported {n} titles", { n: ok })
        : ok === 0
          ? t("Export failed: {reason}", { reason: reason ?? t("unknown error") })
          : t("Exported {ok}, {fail} failed", { ok, fail }),
    );
    exitSelect();
  }, [items, selected, runExport, exitSelect, t]);

  const [type, setType] = useState<TypeKey>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<LocalSortKey>("added");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // Review is tracked per title (a whole series counts once, not per episode).
  const reviewGroups = useMemo(
    () =>
      groupLocal(items)
        .filter((g) => (g.kind === "movie" ? g.entry.needsReview : g.episodes.some((e) => e.needsReview)))
        .map((g) => (g.kind === "movie" ? [g.entry] : g.episodes)),
    [items],
  );
  const reviewCount = reviewGroups.length;
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
  const groups = useMemo(
    () => sortGroups(groupLocal(visible), sortKey, sortDir),
    [visible, sortKey, sortDir],
  );

  const openFirstReview = useCallback(() => {
    if (reviewGroups[0]) setIdentify(reviewGroups[0]);
  }, [reviewGroups]);

  const allSelected = visible.length > 0 && visible.every((i) => selected.has(i.id));
  const selectAll = useCallback(() => {
    setSelected((prev) => {
      if (visible.every((i) => prev.has(i.id))) {
        // Everything visible is already selected → clear it.
        const next = new Set(prev);
        visible.forEach((i) => next.delete(i.id));
        return next;
      }
      return new Set([...prev, ...visible.map((i) => i.id)]);
    });
  }, [visible]);
  const invertSelection = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const it of visible) {
        if (next.has(it.id)) next.delete(it.id);
        else next.add(it.id);
      }
      return next;
    });
  }, [visible]);

  const modals = (
    <>
      <ScanModeModal
        isOpen={pending != null}
        nfoCount={pending?.nfoCount ?? 0}
        onPick={onPickMode}
        onClose={() => setPending(null)}
      />
      <IdentifyModal target={identify} onClose={() => setIdentify(null)} onResolved={onResolveIdentify} />
      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[130] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-canvas shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)] animate-in fade-in slide-in-from-bottom-2 duration-200">
          {toast}
        </div>
      )}
    </>
  );

  if (items.length === 0) {
    return (
      <>
        {modals}
        <EmptyOwned onAddFolder={onAddFolder} busy={busy} error={error} progress={progress} />
      </>
    );
  }

  const cardProps = {
    selectMode,
    selected,
    onToggleSelect: toggleSelect,
    onFixMatch: (e: LocalEntry | LocalEntry[]) => setIdentify(Array.isArray(e) ? e : [e]),
    onExport: onExportOne,
    onOpenDetail: (e: LocalEntry) => {
      const m = localEntryToMeta(e);
      if (m) openMeta(m);
    },
  };

  return (
    <section className="flex flex-col gap-4">
      {modals}
      <FilterBar
        type={type}
        setType={setType}
        query={query}
        setQuery={setQuery}
        counts={counts}
        trailing={
          <div className="ms-auto flex items-center gap-2">
            <SortMenu
              sortKey={sortKey}
              setSortKey={setSortKey}
              sortDir={sortDir}
              setSortDir={setSortDir}
            />
            <button
              type="button"
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors ${
                selectMode
                  ? "bg-ink text-canvas"
                  : "bg-raised text-ink-muted hover:bg-elevated hover:text-ink"
              }`}
            >
              <CheckSquare size={13} strokeWidth={2.2} />
              {selectMode ? t("Done") : t("Select")}
            </button>
            <button
              type="button"
              onClick={onAddFolder}
              disabled={busy}
              className="flex h-9 items-center gap-1.5 rounded-full bg-raised px-3.5 text-[12.5px] font-semibold text-ink-muted transition-colors hover:bg-elevated hover:text-ink disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <FolderPlus size={13} strokeWidth={2.2} />
              )}
              {busy ? scanLabel(progress, t) : t("Add folder")}
            </button>
          </div>
        }
      />
      {selectMode ? (
        <BulkBar
          count={selected.size}
          allSelected={allSelected}
          onSelectAll={selectAll}
          onInvert={invertSelection}
          onDelete={bulkDelete}
          onExport={bulkExport}
          onCancel={exitSelect}
        />
      ) : reviewCount > 0 ? (
        <button
          type="button"
          onClick={openFirstReview}
          className="flex items-center gap-2.5 rounded-xl bg-amber-500/12 px-3.5 py-2.5 text-start ring-1 ring-amber-500/30 transition-colors hover:bg-amber-500/20"
        >
          <AlertTriangle size={15} className="shrink-0 text-amber-500" />
          <span className="text-[12.5px] font-medium text-ink">
            {reviewCount === 1
              ? t("1 title needs review — help us identify it.")
              : t("{n} titles need review — help us identify them.", { n: reviewCount })}
          </span>
          <span className="ms-auto rounded-full bg-amber-500 px-3 py-1 text-[11.5px] font-semibold text-black">
            {t("Review")}
          </span>
        </button>
      ) : null}
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
      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-edge-soft bg-canvas/30 px-6 py-10 text-center text-[13px] text-ink-muted">
          {t("No matches for these filters.")}
        </p>
      ) : (
        <Grid>
          {groups.map((g) =>
            g.kind === "movie" ? (
              <OwnedCard key={g.entry.id} entry={g.entry} {...cardProps} />
            ) : (
              <ShowGroupCard key={g.key} head={g.head} episodes={g.episodes} {...cardProps} />
            ),
          )}
        </Grid>
      )}
    </section>
  );
}

function SortMenu({
  sortKey,
  setSortKey,
  sortDir,
  setSortDir,
}: {
  sortKey: LocalSortKey;
  setSortKey: (k: LocalSortKey) => void;
  sortDir: SortDir;
  setSortDir: (d: SortDir) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const options: Array<[LocalSortKey, string]> = [
    ["added", t("Date added")],
    ["title", t("Title")],
    ["year", t("Year")],
    ["rating", t("Rating")],
    ["runtime", t("Duration")],
  ];
  const activeLabel = options.find(([k]) => k === sortKey)?.[1] ?? "";
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const dirLabel = sortDir === "asc" ? t("Ascending") : t("Descending");
  return (
    <div className="flex items-center gap-1.5">
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 items-center gap-1.5 rounded-full bg-raised px-3.5 text-[12.5px] font-semibold text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
        >
          <ArrowDownUp size={13} strokeWidth={2.2} />
          {activeLabel}
          <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="absolute end-0 top-[calc(100%+6px)] z-50 w-44 rounded-xl border border-edge bg-elevated p-1 shadow-[0_18px_50px_-15px_rgba(0,0,0,0.7)] animate-popover-in">
            {options.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setSortKey(k);
                  setOpen(false);
                }}
                className={`flex h-9 w-full items-center justify-between gap-3 rounded-lg px-3 text-start text-[13px] transition-colors ${
                  sortKey === k ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink"
                }`}
              >
                <span>{label}</span>
                {sortKey === k && <Check size={14} strokeWidth={2.4} className="text-accent" />}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
        title={dirLabel}
        aria-label={dirLabel}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-raised text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
      >
        {sortDir === "asc" ? (
          <ArrowUpNarrowWide size={15} strokeWidth={2.2} />
        ) : (
          <ArrowDownWideNarrow size={15} strokeWidth={2.2} />
        )}
      </button>
    </div>
  );
}

function BulkBar({
  count,
  allSelected,
  onSelectAll,
  onInvert,
  onDelete,
  onExport,
  onCancel,
}: {
  count: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onInvert: () => void;
  onDelete: () => void;
  onExport: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-elevated/70 px-3.5 py-2.5 ring-1 ring-edge-soft">
      <span className="text-[12.5px] font-semibold text-ink">
        {count === 1 ? t("1 selected") : t("{n} selected", { n: count })}
      </span>
      <button
        type="button"
        onClick={onSelectAll}
        className="flex h-8 items-center gap-1.5 rounded-full bg-raised px-3 text-[12px] font-semibold text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
      >
        <CheckSquare size={13} strokeWidth={2.2} />
        {allSelected ? t("Deselect all") : t("Select all")}
      </button>
      <button
        type="button"
        onClick={onInvert}
        className="flex h-8 items-center gap-1.5 rounded-full bg-raised px-3 text-[12px] font-semibold text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
      >
        <FlipHorizontal2 size={13} strokeWidth={2.2} />
        {t("Invert")}
      </button>
      <div className="ms-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onExport}
          disabled={count === 0}
          className="flex h-8 items-center gap-1.5 rounded-full bg-raised px-3 text-[12px] font-semibold text-ink-muted transition-colors hover:bg-canvas hover:text-ink disabled:opacity-40"
        >
          <Download size={13} strokeWidth={2.2} />
          {t("Export")}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={count === 0}
          className="flex h-8 items-center gap-1.5 rounded-full bg-danger/90 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-danger disabled:opacity-40"
        >
          <Trash2 size={13} strokeWidth={2.2} />
          {t("Remove")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-8 items-center rounded-full px-3 text-[12px] font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}

function scanLabel(progress: { found: number; total: number } | null, t: Tr): string {
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

function OwnedCard({
  entry,
  selectMode,
  selected,
  onToggleSelect,
  onFixMatch,
  onExport,
  onOpenDetail,
}: { entry: LocalEntry } & LocalCardProps) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  const { openPlayer } = useView();
  const isSelected = selected.has(entry.id);
  const poster = useLocalPoster(entry);

  const epLabel = episodeLabel(entry);
  const onActivate = useCallback(() => {
    if (selectMode) onToggleSelect([entry.id]);
    else openPlayer(localPlayerSrc(entry));
  }, [selectMode, entry, openPlayer, onToggleSelect]);

  return (
    <div
      className="group relative flex flex-col gap-2 text-start"
      onMouseLeave={() => setConfirm(false)}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onActivate();
          }
        }}
        className={`relative aspect-[2/3] cursor-pointer overflow-hidden rounded-xl bg-elevated shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)] outline-none ring-offset-2 ring-offset-canvas focus-visible:ring-2 focus-visible:ring-ink ${
          isSelected ? "ring-2 ring-accent" : ""
        }`}
      >
        <Poster
          src={poster.src}
          onError={poster.onError}
          seed={entry.id}
          lazy
          className="h-full w-full transition-transform duration-200 group-hover:scale-[1.02]"
        />
        <LocalBadge label={entry.resolution ?? t("local")} className="absolute start-2 top-2" />
        {entry.needsReview && !selectMode && (
          <span className="absolute bottom-2 start-2 inline-flex items-center gap-1 rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-black">
            <AlertTriangle size={9} strokeWidth={2.6} />
            {t("review")}
          </span>
        )}
        {selectMode && (
          <span
            className={`absolute end-2 top-2 flex h-6 w-6 items-center justify-center rounded-md ${
              isSelected ? "bg-accent text-white" : "bg-canvas/80 text-ink-subtle ring-1 ring-edge-soft"
            }`}
          >
            {isSelected ? <CheckSquare size={14} strokeWidth={2.4} /> : <Square size={14} strokeWidth={2.2} />}
          </span>
        )}
        {!selectMode && (
          <>
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-canvas/55 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-canvas shadow-[0_4px_14px_rgba(0,0,0,0.45)]">
                <Play size={18} strokeWidth={2.4} fill="currentColor" className="ml-0.5" />
              </span>
            </span>
            <div className="absolute end-2 top-2 flex flex-col gap-1.5">
              {(entry.tmdbId != null || entry.imdbId) && (
                <CardIconButton title={t("Open details")} onClick={() => onOpenDetail(entry)}>
                  <Info size={11} strokeWidth={2.2} />
                </CardIconButton>
              )}
              <CardIconButton
                title={t("Fix match")}
                onClick={() => onFixMatch([entry])}
              >
                <Wand2 size={11} strokeWidth={2.2} />
              </CardIconButton>
              {entry.tmdbId != null && (
                <CardIconButton title={t("Export .nfo and artwork")} onClick={() => onExport(entry)}>
                  <Download size={11} strokeWidth={2.2} />
                </CardIconButton>
              )}
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
                className={`flex h-7 w-7 items-center justify-center rounded-full text-white shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-all duration-200 ${
                  confirm
                    ? "bg-danger"
                    : "bg-canvas/70 opacity-0 backdrop-blur-sm hover:bg-canvas/90 group-hover:opacity-100"
                }`}
                aria-label={confirm ? t("Confirm remove") : t("Remove from library")}
              >
                {confirm ? <RefreshCw size={11} strokeWidth={2.4} /> : <Trash2 size={11} strokeWidth={2.2} />}
              </button>
            </div>
          </>
        )}
      </div>
      <button type="button" onClick={onActivate} className="text-start">
        <p className="truncate text-[13px] font-medium text-ink transition-colors hover:text-accent" title={entry.filename}>
          {entry.title}
        </p>
        {epLabel ? (
          <p className="-mt-1.5 truncate text-[11.5px] text-ink-subtle">
            {epLabel}
            {entry.year ? ` · ${entry.year}` : ""}
          </p>
        ) : entry.year != null ? (
          <p className="-mt-1.5 truncate text-[11.5px] text-ink-subtle">
            {entry.year}
            {entry.type === "show" && t(" · Series")}
          </p>
        ) : null}
      </button>
    </div>
  );
}

// Build a library entry by matching the filename against TMDB (default mode).
async function buildTmdbEntry(
  f: ScannedFile,
  parsed: ReturnType<typeof parseFilename>,
  tmdbKey: string | null,
): Promise<LocalEntry> {
  let tmdb: TmdbLookup = {};
  if (tmdbKey) tmdb = await tmdbLookup(tmdbKey, parsed.title, parsed.year, parsed.type).catch(() => ({}));
  const needsReview = tmdbKey ? lowConfidence(parsed, tmdb) : false;
  // Once confidently identified, show the real TMDB name (and its year) instead of
  // the messy filename-derived title. Low-confidence matches keep the parsed name
  // so the user can still recognise and fix them in the review queue.
  const identified = tmdb.tmdbId != null && !needsReview;
  return {
    id: hashPath(f.path),
    path: f.path,
    filename: f.filename,
    title: identified ? tmdb.matchedTitle?.trim() || parsed.title : parsed.title,
    year: (identified ? tmdb.matchedYear : null) ?? parsed.year,
    type: parsed.type,
    resolution: parsed.resolution,
    rating: tmdb.rating ?? null,
    runtime: tmdb.runtime ?? null,
    poster: tmdb.poster ?? null,
    tmdbId: tmdb.tmdbId ?? null,
    imdbId: tmdb.imdbId ?? null,
    season: parsed.season,
    episode: parsed.episode,
    addedAt: Date.now(),
    source: "tmdb",
    needsReview: needsReview || undefined,
  };
}

// Build a library entry from a .nfo sidecar and local artwork, filling gaps from TMDB.
async function buildNfoEntry(
  f: ScannedFile,
  parsed: ReturnType<typeof parseFilename>,
  tmdbKey: string | null,
): Promise<LocalEntry> {
  const nfoPath = await findNfo(f.path);
  const nfo = nfoPath ? await readNfo(nfoPath) : null;

  // For a show, a per-episode <episodedetails> .nfo carries the EPISODE title and
  // the episode's own ids/thumbnail — using those would split one series into a
  // card per episode. The series identity + artwork live in the folder-level
  // tvshow.nfo (often one directory up from the episodes), so read that instead.
  const isShow = parsed.type === "show";
  let seriesNfo: Awaited<ReturnType<typeof readNfo>> = null;
  if (isShow) {
    const showNfoPath = await findShowNfo(f.path);
    seriesNfo = showNfoPath ? await readNfo(showNfoPath) : null;
  }
  const meta = isShow ? seriesNfo : nfo;

  const files = isShow ? await findShowArt(f.path, parsed.season) : await findLocalArt(f.path);

  // Artwork priority per slot: a real file on disk (season poster / poster.jpg /
  // fanart …), then the URL the series .nfo references (TMM/Kodi embed TMDB art
  // URLs), then nothing. Never the per-episode thumbnail.
  const art = {
    poster: files.poster ?? meta?.art?.poster,
    logo: files.logo ?? meta?.art?.logo,
    backdrop: files.backdrop ?? meta?.art?.backdrop,
  };

  // Title is always the SERIES name for shows (tvshow.nfo <title>, else the
  // episode's <showtitle>, else the filename-derived show title) — never the
  // per-episode <title>.
  let title = (
    isShow ? meta?.title || nfo?.showTitle || parsed.title : nfo?.title || parsed.title
  ).trim();
  const year = meta?.year ?? parsed.year;
  let tmdbId = meta?.tmdbId ?? null;
  let imdbId = meta?.imdbId ?? null;
  let poster: string | null = null;
  let rating = meta?.rating ?? null;
  let runtime = meta?.runtime ?? null;

  // If the sidecar didn't identify the title, match it against TMDB to fill in the
  // ids and a poster. When it already has a tmdbId, the card live-fetches any
  // missing poster/art from TMDB in the current image language, so no search here.
  if (tmdbKey && !tmdbId) {
    const look = await tmdbLookup(tmdbKey, title, year, parsed.type).catch(() => ({} as TmdbLookup));
    if (look.tmdbId) tmdbId = look.tmdbId;
    if (!imdbId && look.imdbId) imdbId = look.imdbId;
    if (!art.poster && look.poster) poster = look.poster;
    if (rating == null && look.rating != null) rating = look.rating;
    if (runtime == null && look.runtime != null) runtime = look.runtime;
    // Prefer the real TMDB name when the .nfo didn't provide a clean series title.
    const hadNfoTitle = isShow ? !!(meta?.title || nfo?.showTitle) : !!nfo?.title;
    if (!hadNfoTitle && look.matchedTitle) title = look.matchedTitle.trim();
  }

  const localArt = art.poster || art.logo || art.backdrop ? art : undefined;
  const needsReview = !tmdbId && !imdbId && !art.poster;

  return {
    id: hashPath(f.path),
    path: f.path,
    filename: f.filename,
    title,
    year,
    type: parsed.type,
    resolution: parsed.resolution,
    rating,
    runtime,
    poster,
    tmdbId,
    imdbId,
    season: parsed.season,
    episode: parsed.episode,
    addedAt: Date.now(),
    source: "nfo",
    localArt,
    needsReview: needsReview || undefined,
  };
}

type TmdbLookup = {
  tmdbId?: number;
  imdbId?: string;
  poster?: string;
  matchedTitle?: string;
  matchedYear?: number | null;
  rating?: number;
  runtime?: number;
};

// Heuristic: is a TMDB match too weak to trust? Flags for review when there was no
// match at all, the years disagree by more than a year, or the matched title
// shares no words with the parsed title (a likely wrong pick).
function lowConfidence(parsed: ReturnType<typeof parseFilename>, tmdb: TmdbLookup): boolean {
  if (!tmdb.tmdbId) return true;
  if (
    parsed.year != null &&
    tmdb.matchedYear != null &&
    Math.abs(parsed.year - tmdb.matchedYear) > 1
  ) {
    return true;
  }
  if (tmdb.matchedTitle) {
    const a = tokenize(parsed.title);
    const b = tokenize(tmdb.matchedTitle);
    if (a.length && b.length && !a.some((w) => b.includes(w))) return true;
  }
  return false;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1);
}

async function tmdbLookup(
  key: string,
  title: string,
  year: number | null,
  type: "movie" | "show",
): Promise<TmdbLookup> {
  const path = type === "movie" ? "movie" : "tv";
  const params = new URLSearchParams({ api_key: key, query: title });
  const lang = effectiveTmdbLanguage() || imageRequestLang();
  if (lang) params.set("language", lang);
  if (year && type === "movie") params.set("year", String(year));
  if (year && type === "show") params.set("first_air_date_year", String(year));
  const r = await fetch(`https://api.themoviedb.org/3/search/${path}?${params}`);
  if (!r.ok) return {};
  const json = await r.json();
  const top = json.results?.[0];
  if (!top) return {};
  // One details call (with external_ids appended) gives the imdb id, rating, and
  // runtime together — same request count as the old external_ids-only fetch.
  let imdbId: string | undefined;
  let rating: number | undefined;
  let runtime: number | undefined;
  try {
    const dparams = new URLSearchParams({ api_key: key, append_to_response: "external_ids" });
    if (lang) dparams.set("language", lang);
    const dr = await fetch(`https://api.themoviedb.org/3/${path}/${top.id}?${dparams}`);
    if (dr.ok) {
      const dj = await dr.json();
      const imdb = dj.imdb_id ?? dj.external_ids?.imdb_id;
      if (typeof imdb === "string" && imdb.startsWith("tt")) imdbId = imdb;
      if (typeof dj.vote_average === "number" && dj.vote_average > 0) rating = dj.vote_average;
      if (type === "movie" && typeof dj.runtime === "number" && dj.runtime > 0) runtime = dj.runtime;
      if (type === "show" && Array.isArray(dj.episode_run_time) && dj.episode_run_time[0] > 0) {
        runtime = dj.episode_run_time[0];
      }
    }
  } catch {
    /* noop */
  }
  if (rating == null && typeof top.vote_average === "number" && top.vote_average > 0) {
    rating = top.vote_average;
  }
  const date: string | undefined = top.release_date ?? top.first_air_date;
  return {
    tmdbId: top.id,
    imdbId,
    poster: top.poster_path ? `https://image.tmdb.org/t/p/w342${top.poster_path}` : undefined,
    matchedTitle: top.title ?? top.name,
    matchedYear: date ? parseInt(date.slice(0, 4), 10) : null,
    rating,
    runtime,
  };
}

function hashPath(path: string): string {
  let hash = 5381;
  for (let i = 0; i < path.length; i++) {
    hash = ((hash << 5) + hash + path.charCodeAt(i)) | 0;
  }
  return `local-${(hash >>> 0).toString(36)}`;
}
