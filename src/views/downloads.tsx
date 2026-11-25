import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, Download as DownloadIcon, FolderOpen, HardDrive, Pause, Play, Trash2, X } from "lucide-react";
import { Poster, usePosterChain } from "@/components/poster";
import { DeleteDownloadDialog } from "@/components/delete-download-dialog";
import { hasNativeDesktopUx, isMobileTauri } from "@/lib/platform";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { getUiLanguage, t, useT } from "@/lib/i18n";
import { DownloadDirBar } from "./downloads/download-dir-bar";
import { downloadRecoveryHint, downloadStatusLabel } from "@/lib/download/presentation";
import { validatedDownloadSource } from "@/lib/download/offline-playback";
import {
  cancelDownload,
  pauseDownload,
  prioritizeDownload,
  resumeDownload,
  revealDownload,
  useDownloads,
  type DownloadItem,
} from "@/lib/download/downloads-store";

function fmtBytes(n: number | null): string {
  if (n == null || n <= 0) return "";
  if (n >= 1024 ** 3) return t("{n} GB", { n: (n / 1024 ** 3).toLocaleString(getUiLanguage(), { maximumFractionDigits: 2 }) });
  if (n >= 1024 ** 2) return t("{n} MB", { n: Math.round(n / 1024 ** 2) });
  return t("{n} KB", { n: Math.round(n / 1024) });
}

function fmtSpeed(bps: number): string {
  if (bps <= 0) return "";
  if (bps >= 1024 ** 2) return t("{n} MB/s", { n: (bps / 1024 ** 2).toLocaleString(getUiLanguage(), { maximumFractionDigits: 1 }) });
  return t("{n} KB/s", { n: Math.round(bps / 1024) });
}

function fmtEta(d: DownloadItem): string {
  if (d.bytesPerSec <= 0 || d.totalBytes == null) return "";
  const remain = d.totalBytes - d.receivedBytes;
  if (remain <= 0) return "";
  const secs = remain / d.bytesPerSec;
  if (secs >= 3600) return t("{n}h left", { n: Math.round(secs / 3600) });
  if (secs >= 60) return t("{n}m left", { n: Math.round(secs / 60) });
  return t("{n}s left", { n: Math.round(secs) });
}

type DownloadGroup =
  | { kind: "movie"; item: DownloadItem }
  | { kind: "show"; metaId: string; title: string; poster: string | null; items: DownloadItem[] };

function statusRank(s: DownloadItem["status"]): number {
  if (s === "downloading") return 0;
  if (s === "queued" || s === "paused") return 1;
  return s === "error" || s === "interrupted" || s === "removal-error" || s === "removing" ? 2 : s === "done" ? 3 : 4;
}

function buildGroups(items: DownloadItem[]): DownloadGroup[] {
  const shows = new Map<string, DownloadItem[]>();
  const movies: DownloadItem[] = [];
  for (const d of items) {
    if (d.season != null) {
      const arr = shows.get(d.metaId);
      if (arr) arr.push(d);
      else shows.set(d.metaId, [d]);
    } else {
      movies.push(d);
    }
  }
  const groups: DownloadGroup[] = movies.map((item) => ({ kind: "movie", item }));
  for (const [metaId, arr] of shows) {
    groups.push({ kind: "show", metaId, title: arr[0].title, poster: arr[0].poster, items: arr });
  }
  const keyOf = (g: DownloadGroup) => {
    const its = g.kind === "movie" ? [g.item] : g.items;
    return {
      best: Math.min(...its.map((d) => statusRank(d.status))),
      recent: Math.max(...its.map((d) => d.startedAt)),
    };
  };
  return groups.sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    return ka.best - kb.best || kb.recent - ka.recent;
  });
}

export function DownloadsView({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useT();
  const items = useDownloads();
  const [pendingRemoval, setPendingRemoval] = useState<DownloadItem[] | null>(null);
  const removeOne = (item: DownloadItem) => setPendingRemoval([item]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const activeFilterRef = useRef<HTMLButtonElement>(null);
  const focusedRef = useRef<HTMLElement | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "ready" | "attention">("all");
  const active = items.filter((d) => d.status === "downloading").length;
  const queued = items.filter((d) => d.status === "queued").length;
  const paused = items.filter((d) => d.status === "paused").length;
  const ready = items.filter((d) => d.status === "done").length;
  const attention = items.filter((d) =>
    ["paused", "error", "interrupted", "removal-error"].includes(d.status),
  ).length;
  const savedBytes = items.reduce(
    (sum, d) => (d.status === "done" ? sum + (d.totalBytes ?? d.receivedBytes) : sum),
    0,
  );
  const groups = useMemo(() => buildGroups(items.filter((d) => filter === "all" || (filter === "ready" ? d.status === "done" : filter === "active" ? ["downloading", "queued", "removing"].includes(d.status) : ["paused", "error", "interrupted", "removal-error"].includes(d.status)))), [items, filter]);

  useLayoutEffect(() => {
    if (focusedRef.current && !focusedRef.current.isConnected && document.activeElement === document.body) {
      (activeFilterRef.current ?? headingRef.current)?.focus();
    }
  }, [groups]);

  const summaryCards = items.length > 0 && (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="vayra-surface flex items-center gap-3.5 px-4 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-edge-soft/75 bg-elevated/80 text-success">
          <Check size={17} strokeWidth={2.4} />
        </span>
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium text-ink-subtle">{t("Ready to watch")}</p>
          <p className="font-display text-[22px] font-semibold leading-tight tabular-nums text-ink">{ready}</p>
        </div>
      </div>
      <div className="vayra-surface flex items-center gap-3.5 px-4 py-3.5">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-edge-soft/75 bg-elevated/80 ${attention > 0 ? "text-danger" : "text-ink-muted"}`}>
          {attention > 0 ? <AlertTriangle size={17} strokeWidth={2} /> : <DownloadIcon size={17} strokeWidth={2} />}
        </span>
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium text-ink-subtle">
            {attention > 0 ? t("Needs attention") : t("Downloading")}
          </p>
          <p className="font-display text-[22px] font-semibold leading-tight tabular-nums text-ink">
            {attention > 0 ? attention : active + queued}
          </p>
        </div>
      </div>
      <div className="vayra-surface flex items-center gap-3.5 px-4 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-edge-soft/75 bg-elevated/80 text-ink-muted">
          <HardDrive size={17} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium text-ink-subtle">{t("Saved to disk")}</p>
          <p className="truncate font-display text-[22px] font-semibold leading-tight tabular-nums text-ink">
            {savedBytes > 0 ? fmtBytes(savedBytes) : "—"}
          </p>
        </div>
      </div>
    </div>
  );

  const body = (
    <>
      {embedded ? (
        <>
          <h2 ref={headingRef} tabIndex={-1} className="sr-only">{t("Downloads")}</h2>
          {summaryCards}
        </>
      ) : (
        <header className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="vayra-kicker">{t("Available offline")}</span>
              <h1 ref={headingRef} tabIndex={-1} className="mac-page-title">{t("Downloads")}</h1>
              <p className="text-[14px] tabular-nums text-ink-muted">
                {items.length === 0
                  ? t("Saved movies and episodes for offline watching")
                  : [
                      items.length === 1 ? t("1 item") : t("{n} items", { n: items.length }),
                      active > 0 ? t("{n} downloading", { n: active }) : null,
                      queued > 0 ? t("{n} waiting", { n: queued }) : null,
                      paused > 0 ? t("{n} paused", { n: paused }) : null,
                      savedBytes > 0 ? t("{size} saved", { size: fmtBytes(savedBytes) }) : null,
                    ]
                      .filter(Boolean)
                      .join("  ·  ")}
              </p>
            </div>
          </div>

          {summaryCards}

          <div className="vayra-header-rule" aria-hidden="true" />
        </header>
      )}

      <DownloadDirBar />

      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div aria-label={t("Filter downloads")} className="vayra-pill-track flex-wrap">
            {(["all", "active", "ready", "attention"] as const).map((id) => (
              <button
                type="button"
                key={id}
                ref={filter === id ? activeFilterRef : undefined}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className={`rounded-lg px-3.5 py-2 text-[13px] font-medium transition-[background-color,color] duration-150 ${
                  filter === id
                    ? "bg-ink text-canvas font-semibold shadow-sm"
                    : "text-ink-muted hover:bg-elevated/80 hover:text-ink"
                }`}
              >
                {t(id === "all" ? "All" : id === "active" ? "Downloading" : id === "ready" ? "Ready to watch" : "Needs attention")}
              </button>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && groups.length === 0 && (
        <div className="vayra-surface flex flex-col items-center gap-3.5 px-6 py-12 text-center">
          <p role="status" className="text-[14px] text-ink-muted">{t("No downloads in this category")}</p>
          <button type="button" className="mac-secondary-button" onClick={() => setFilter("all")}>
            {t("Show all")}
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) =>
            g.kind === "movie" ? (
              <ul key={g.item.id} className="contents">
                <DownloadRow d={g.item} onRemove={removeOne} />
              </ul>
            ) : (
              <ShowGroup key={g.metaId} group={g} onRemove={removeOne} onRemoveMany={setPendingRemoval} />
            ),
          )}
        </div>
      )}
    </>
  );

  if (embedded) {
    return (
      <section
        aria-label={t("Downloads")}
        onFocusCapture={(event) => { focusedRef.current = event.target; }}
        onBlurCapture={(event) => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) focusedRef.current = null; }}
        className="mx-auto flex w-full flex-col gap-6"
      >
        {body}
        {pendingRemoval && <DeleteDownloadDialog items={pendingRemoval} returnFocusRef={headingRef} onClose={() => setPendingRemoval(null)} />}
      </section>
    );
  }

  return (
    <main onFocusCapture={(event) => { focusedRef.current = event.target; }}
      onBlurCapture={(event) => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) focusedRef.current = null; }}
      className={`flex-1 overflow-y-auto bg-canvas px-5 pb-24 sm:px-8 lg:px-12 ${
        hasNativeDesktopUx() ? "pt-16 lg:pt-20" : "pt-24 lg:pt-28"
      }`}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {body}
      </div>
      {pendingRemoval && <DeleteDownloadDialog items={pendingRemoval} returnFocusRef={headingRef} onClose={() => setPendingRemoval(null)} />}
    </main>
  );
}

function EmptyState() {
  const t = useT();
  const { setView } = useView();
  return (
    <div className="vayra-surface flex flex-col items-center justify-center gap-4 px-8 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-edge-soft/75 bg-elevated/80 text-ink-subtle">
        <DownloadIcon size={25} strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="font-display text-[20px] font-semibold tracking-[-0.015em] text-ink">{t("No downloads yet")}</p>
        <p className="max-w-[380px] text-[13.5px] leading-relaxed text-ink-muted">
          {isMobileTauri()
            ? t("Open any movie or show, tap the download button on an episode, and pick a source to save it here for offline watching.")
            : t("Open any movie or show, hover an episode, and click the download icon. Pick the exact source you want and it saves here for offline watching.")}
        </p>
      </div>
      <button type="button" className="mac-primary-button mt-1" onClick={() => setView("discover")}>{t("Explore")}</button>
    </div>
  );
}

function ShowGroup({ group, onRemove, onRemoveMany }: { group: Extract<DownloadGroup, { kind: "show" }>; onRemove: (item: DownloadItem) => void; onRemoveMany: (items: DownloadItem[]) => void }) {
  const t = useT();
  const { settings } = useSettings();
  const poster = usePosterChain(settings.rpdbKey, group.metaId, group.poster ?? undefined, "series");
  const episodes = useMemo(
    () =>
      [...group.items].sort(
        (a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0),
      ),
    [group.items],
  );
  // Episodes picked for deleting together; ids of episodes since removed are ignored.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const selectable = episodes.filter((d) => d.status !== "removing");
  const picked = selectable.filter((d) => selected?.has(d.id));
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allPicked = selectable.length > 0 && picked.length === selectable.length;
  const totalBytes = episodes.reduce(
    (sum, d) => (d.status === "done" ? sum + (d.totalBytes ?? d.receivedBytes) : sum),
    0,
  );
  return (
    <div className="vayra-surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-3.5 px-4 py-3.5">
        <div className="h-[56px] w-[38px] shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
          <Poster src={poster.src} onError={poster.onError} seed={group.metaId} ratio="portrait" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-display text-[15.5px] font-semibold tracking-[-0.01em] text-ink">{group.title}</span>
          <span className="text-[12px] tabular-nums text-ink-subtle">
            {episodes.length === 1 ? t("1 episode") : t("{n} episodes", { n: episodes.length })}
            {totalBytes > 0 ? `  ·  ${fmtBytes(totalBytes)}` : ""}
          </span>
        </div>
        {episodes.length > 1 && (
          <div className="ms-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {selected == null ? (
              <button type="button" className="mac-secondary-button" onClick={() => setSelected(new Set())}>{t("Select")}</button>
            ) : (
              <>
                <button type="button" className="mac-secondary-button" onClick={() => setSelected(allPicked ? new Set() : new Set(selectable.map((d) => d.id)))}>
                  {allPicked ? t("Deselect all") : t("Select all")}
                </button>
                <button type="button" className="mac-secondary-button text-danger disabled:opacity-50" disabled={picked.length === 0} onClick={() => onRemoveMany(picked)}>
                  {t("Delete selected ({n})", { n: picked.length })}
                </button>
                <button type="button" className="mac-secondary-button" onClick={() => setSelected(null)}>{t("Cancel")}</button>
              </>
            )}
          </div>
        )}
      </div>
      <ul className="flex flex-col gap-2 border-t border-edge-soft/60 bg-canvas/35 p-2.5">
        {episodes.map((d) => (
          <DownloadRow
            key={d.id}
            d={d}
            compact
            onRemove={onRemove}
            selection={selected == null ? undefined : { checked: selected.has(d.id), disabled: d.status === "removing", onToggle: () => toggle(d.id) }}
          />
        ))}
      </ul>
    </div>
  );
}

function statusBadgeClasses(status: DownloadItem["status"]): { pill: string; dot: string } {
  switch (status) {
    case "downloading":
      return {
        pill: "border-ink/25 bg-ink/10 text-ink",
        dot: "bg-ink animate-pulse motion-reduce:animate-none",
      };
    case "done":
      return {
        pill: "border-success/30 bg-success/10 text-ink",
        dot: "bg-success",
      };
    case "interrupted":
      return {
        pill: "border-info/30 bg-info/10 text-info",
        dot: "bg-info",
      };
    case "error":
    case "removal-error":
      return {
        pill: "border-danger/35 bg-danger/10 text-danger",
        dot: "bg-danger",
      };
    case "paused":
    case "queued":
    case "removing":
    case "canceled":
      return {
        pill: "border-edge-soft/80 bg-elevated/75 text-ink-muted",
        dot: "bg-ink-subtle",
      };
  }
}

function DownloadRow({ d, compact = false, onRemove, selection }: {
  d: DownloadItem;
  compact?: boolean;
  onRemove: (item: DownloadItem) => void;
  /** Shown while the show's episodes are being picked for deleting together. */
  selection?: { checked: boolean; disabled: boolean; onToggle: () => void };
}) {
  const t = useT();
  const { openPlayer } = useView();
  const [localError, setLocalError] = useState(false);
  const { settings } = useSettings();
  const poster = usePosterChain(
    settings.rpdbKey,
    d.metaId,
    d.poster ?? undefined,
    d.season != null ? "series" : "movie",
  );
  const pct = Math.round(d.ratio * 100);
  const downloading = d.status === "downloading";
  const queued = d.status === "queued";
  const paused = d.status === "paused";
  const resumable = paused || d.status === "interrupted" || d.status === "error";
  const playLocal = async () => {
    const source = await validatedDownloadSource(d);
    setLocalError(!source);
    if (source) openPlayer(source);
  };
  const badge = statusBadgeClasses(d.status);
  return (
    <li
      className={`group flex items-center gap-4 rounded-2xl border p-3.5 transition-[background-color,border-color] duration-150 ${
        compact
          ? "border-edge-soft/65 bg-surface/85 hover:border-edge hover:bg-elevated/80"
          : "border-edge-soft/75 bg-surface/85 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] hover:border-edge hover:bg-elevated/80"
      }`}
    >
      {selection && (
        <input
          type="checkbox"
          aria-label={d.subtitle ?? d.title}
          checked={selection.checked}
          disabled={selection.disabled}
          onChange={selection.onToggle}
          className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
        />
      )}
      <div
        className={`${compact ? "h-[46px] w-[32px]" : "h-[70px] w-[48px]"} shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10`}
      >
        <Poster src={poster.src} onError={poster.onError} seed={d.metaId} ratio="portrait" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-tight ${badge.pill}`}>
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
          {downloadStatusLabel(d.status, t)}
        </span>
        {localError && <p role="alert" className="text-[12px] text-danger">{t("This file is missing or incomplete. Download it again from the title page.")}</p>}
        {(d.status === "error" || d.status === "interrupted") && <p className="max-w-[65ch] text-[12px] text-ink-muted">{downloadRecoveryHint(d.error, t)}</p>}
        {d.status === "removal-error" && <p role="alert" className="max-w-[65ch] text-[12px] text-danger">{t("The file could not be fully deleted. It remains in Downloads. Check folder permissions, then try again.")}</p>}
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[14.5px] font-semibold text-ink">
            {compact ? (d.subtitle ?? d.title) : d.title}
          </span>
          {!compact && d.subtitle && (
            <span className="shrink-0 truncate text-[12px] text-ink-subtle">{d.subtitle}</span>
          )}
        </div>
        {downloading || paused ? (
          <>
            <div className="h-2 w-full overflow-hidden rounded-full bg-raised">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${paused ? "bg-ink-muted" : "bg-ink"}`}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-[11.5px] tabular-nums text-ink-muted">
              <span className="font-medium text-ink">{paused ? t("Paused at {pct}%", { pct }) : `${pct}%`}</span>
              {d.totalBytes != null && (
                <span className="text-ink-subtle">
                  {fmtBytes(d.receivedBytes)} / {fmtBytes(d.totalBytes)}
                </span>
              )}
              {downloading && fmtSpeed(d.bytesPerSec) && <span>· {fmtSpeed(d.bytesPerSec)}</span>}
              {downloading && fmtEta(d) && <span className="text-ink-subtle">· {fmtEta(d)}</span>}
            </div>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-[12px]">
            {d.status === "done" && (
              <>
                <Check size={13} className="text-success" strokeWidth={2.6} />
                <span className="tabular-nums text-ink-muted">
                  {t("Saved")}
                  {d.totalBytes ? ` · ${fmtBytes(d.totalBytes)}` : ""}
                </span>
              </>
            )}
            {d.status === "error" && d.error && <details className="text-ink-subtle"><summary>{t("Technical details")}</summary><p className="break-all">{d.error}</p></details>}
            {queued && <span className="text-ink-subtle">{t("Waiting for a free slot")}</span>}
            {d.status === "canceled" && <span className="text-ink-subtle">{t("Canceled")}</span>}
            {d.status === "interrupted" && (
              <span className="text-info/85">{t("Interrupted · resume to continue")}</span>
            )}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {queued && <button type="button" className="mac-secondary-button" onClick={() => prioritizeDownload(d.id)}>{t("Move to front")}</button>}
        {downloading || queued ? (
          <>
            <RowBtn prominent label={t("Pause download")} onClick={() => pauseDownload(d.id)}>
              <Pause size={15} strokeWidth={2.2} fill="currentColor" />
            </RowBtn>
            <RowBtn label={t("Cancel download")} onClick={() => cancelDownload(d.id)}>
              <X size={15} strokeWidth={2.2} />
            </RowBtn>
          </>
        ) : (
          <>
            {resumable && (
              <RowBtn prominent primary label={t("Resume download")} onClick={() => resumeDownload(d.id)}>
                <Play size={15} strokeWidth={2.2} fill="currentColor" />
              </RowBtn>
            )}
            {d.status === "done" && (
              <>
                <RowBtn prominent primary label={t("Watch offline")} onClick={() => void playLocal()}>
                  <Play size={15} strokeWidth={2.2} fill="currentColor" />
                </RowBtn>
                <RowBtn label={t("Show in folder")} onClick={() => void revealDownload(d.id)}>
                  <FolderOpen size={15} strokeWidth={2} />
                </RowBtn>
              </>
            )}
            {d.status === "removal-error" && <RowBtn label={t("Show in folder")} onClick={() => void revealDownload(d.id)}><FolderOpen size={15} /></RowBtn>}
            <RowBtn disabled={d.status === "removing"} label={t(d.status === "removal-error" ? "Retry deletion" : "Delete download and file")} onClick={() => onRemove(d)}>
              <Trash2 size={15} strokeWidth={2} />
            </RowBtn>
          </>
        )}
      </div>
    </li>
  );
}

function RowBtn({
  label,
  onClick,
  children,
  prominent = false,
  primary = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  prominent?: boolean;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => { event.currentTarget.focus(); onClick(); }}
      aria-label={label}
      title={label}
      className={`flex min-h-10 items-center justify-center gap-2 rounded-xl transition-[background-color,color,opacity,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-45 ${
        primary
          ? "bg-ink px-3.5 text-[12.5px] font-semibold text-canvas hover:opacity-90"
          : prominent
            ? "border border-edge-soft/80 bg-elevated px-3.5 text-[12.5px] font-medium text-ink hover:border-edge hover:bg-raised"
            : "w-10 border border-transparent text-ink-muted hover:border-edge-soft/75 hover:bg-elevated hover:text-ink"
      }`}
    >
      {children}
      {prominent && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}
