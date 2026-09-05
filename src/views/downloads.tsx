import { useMemo, useState, type ReactNode } from "react";
import { Check, Download as DownloadIcon, FolderOpen, Pause, Play, Trash2, X } from "lucide-react";
import { Poster, usePosterChain } from "@/components/poster";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { getUiLanguage, t, useT } from "@/lib/i18n";
import { DownloadDirBar } from "./downloads/download-dir-bar";
import { downloadRecoveryHint, downloadStatusLabel } from "@/lib/download/presentation";
import { validatedDownloadSource } from "@/lib/download/offline-playback";
import {
  cancelDownload,
  pauseDownload,
  removeDownload,
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
  return s === "error" || s === "interrupted" ? 2 : s === "done" ? 3 : 4;
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

export function DownloadsView() {
  const t = useT();
  const items = useDownloads();
  const [filter, setFilter] = useState<"all" | "active" | "ready" | "attention">("all");
  const active = items.filter((d) => d.status === "downloading").length;
  const queued = items.filter((d) => d.status === "queued").length;
  const paused = items.filter((d) => d.status === "paused").length;
  const savedBytes = items.reduce(
    (sum, d) => (d.status === "done" ? sum + (d.totalBytes ?? d.receivedBytes) : sum),
    0,
  );
  const groups = useMemo(() => buildGroups(items.filter((d) => filter === "all" || (filter === "ready" ? d.status === "done" : filter === "active" ? ["downloading", "queued"].includes(d.status) : ["paused", "error", "interrupted"].includes(d.status)))), [items, filter]);

  return (
    <main className="flex-1 overflow-y-auto bg-canvas px-5 pb-24 pt-24 sm:px-8 lg:px-12 lg:pt-28">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8">
          <h1 className="text-[28px] font-semibold tracking-tight text-ink">{t("Downloads")}</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-subtle">
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
        </header>

        <DownloadDirBar />
        {items.length > 0 && <div aria-label={t("Filter downloads")} className="mb-5 flex flex-wrap gap-2">{(["all", "active", "ready", "attention"] as const).map((id) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)} className={`mac-secondary-button ${filter === id ? "bg-raised text-ink" : "text-ink-muted"}`}>{t(id === "all" ? "All" : id === "active" ? "Downloading" : id === "ready" ? "Ready to watch" : "Needs resuming")}</button>)}</div>}
        {items.length > 0 && groups.length === 0 && <p role="status" className="py-8 text-[14px] text-ink-muted">{t("No downloads in this category")}</p>}

        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-2.5">
            {groups.map((g) =>
              g.kind === "movie" ? (
                <ul key={g.item.id} className="contents">
                  <DownloadRow d={g.item} />
                </ul>
              ) : (
                <ShowGroup key={g.metaId} group={g} />
              ),
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyState() {
  const t = useT();
  const { setView } = useView();
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-[20px] border border-dashed border-edge-soft bg-elevated/30 px-8 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-elevated text-ink-subtle">
        <DownloadIcon size={26} strokeWidth={1.8} />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-[15px] font-semibold text-ink">{t("No downloads yet")}</p>
        <p className="max-w-[340px] text-[13.5px] leading-relaxed text-ink-muted">
          {t("Open any movie or show, hover an episode, and click the download icon. Pick the exact source you want and it saves here for offline watching.")}
        </p>
      </div>
      <button type="button" className="mac-primary-button" onClick={() => setView("discover")}>{t("Explore")}</button>
    </div>
  );
}

function ShowGroup({ group }: { group: Extract<DownloadGroup, { kind: "show" }> }) {
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
  const totalBytes = episodes.reduce(
    (sum, d) => (d.status === "done" ? sum + (d.totalBytes ?? d.receivedBytes) : sum),
    0,
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-edge-soft bg-elevated/25">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="h-[52px] w-[36px] shrink-0 overflow-hidden rounded-md">
          <Poster src={poster.src} onError={poster.onError} seed={group.metaId} ratio="portrait" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-semibold text-ink">{group.title}</span>
          <span className="text-[11.5px] text-ink-subtle">
            {episodes.length === 1 ? t("1 episode") : t("{n} episodes", { n: episodes.length })}
            {totalBytes > 0 ? `  ·  ${fmtBytes(totalBytes)}` : ""}
          </span>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5 border-t border-edge-soft/50 px-2 pb-2 pt-2">
        {episodes.map((d) => (
          <DownloadRow key={d.id} d={d} compact />
        ))}
      </ul>
    </div>
  );
}

function DownloadRow({ d, compact = false }: { d: DownloadItem; compact?: boolean }) {
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
  return (
    <li className="group flex items-center gap-4 rounded-2xl border border-edge-soft bg-elevated/40 p-3 transition-colors hover:bg-elevated/70">
      <div
        className={`${compact ? "h-[44px] w-[30px]" : "h-[68px] w-[46px]"} shrink-0 overflow-hidden rounded-lg`}
      >
        <Poster src={poster.src} onError={poster.onError} seed={d.metaId} ratio="portrait" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[12px] font-medium text-ink-muted">{downloadStatusLabel(d.status, t)}</span>
        {localError && <p role="alert" className="text-[12px] text-danger">{t("This file is missing or incomplete. Download it again from the title page.")}</p>}
        {(d.status === "error" || d.status === "interrupted") && <p className="max-w-[65ch] text-[12px] text-ink-muted">{downloadRecoveryHint(d.error, t)}</p>}
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
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out ${paused ? "bg-ink-muted" : "bg-accent"}`}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-[11.5px] tabular-nums text-ink-muted">
              <span>{paused ? t("Paused at {pct}%", { pct }) : `${pct}%`}</span>
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
                <Check size={13} className="text-accent" strokeWidth={2.6} />
                <span className="text-ink-muted">
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
      <div className="flex shrink-0 items-center gap-1">
        {downloading || queued ? (
          <>
            <RowBtn prominent label={t("Pause download")} onClick={() => pauseDownload(d.id)}>
              <Pause size={16} strokeWidth={2.2} fill="currentColor" />
            </RowBtn>
            <RowBtn label={t("Cancel download")} onClick={() => cancelDownload(d.id)}>
              <X size={16} strokeWidth={2.2} />
            </RowBtn>
          </>
        ) : (
          <>
            {resumable && (
              <RowBtn prominent label={t("Resume download")} onClick={() => resumeDownload(d.id)}>
                <Play size={16} strokeWidth={2.2} fill="currentColor" />
              </RowBtn>
            )}
            {d.status === "done" && (
              <>
                <RowBtn prominent label={t("Watch offline")} onClick={() => void playLocal()}>
                  <Play size={16} strokeWidth={2.2} fill="currentColor" />
                </RowBtn>
                <RowBtn label={t("Show in folder")} onClick={() => void revealDownload(d.id)}>
                  <FolderOpen size={16} strokeWidth={2} />
                </RowBtn>
              </>
            )}
            <RowBtn label={t("Delete download and file")} onClick={() => removeDownload(d.id)}>
              <Trash2 size={16} strokeWidth={2} />
            </RowBtn>
          </>
        )}
      </div>
    </li>
  );
}

function RowBtn({ label, onClick, children, prominent = false }: { label: string; onClick: () => void; children: ReactNode; prominent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-ink-muted transition-colors hover:bg-ink/10 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${prominent ? "bg-raised px-3 text-[12px] font-medium" : "w-11"}`}
    >
      {children}
      {prominent && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}
