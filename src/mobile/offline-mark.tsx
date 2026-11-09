import { useMemo } from "react";
import { ArrowDownToLine } from "lucide-react";
import { useDownloads, type DownloadItem } from "@/lib/download/downloads-store";
import { useT } from "@/lib/i18n";
import { readLocalLibrary } from "@/lib/local-library";

/**
 * Titles this phone can play without a source: a finished download, or a file
 * in the local library (matched by IMDb id, or as `local:<entry id>`).
 */
export function useOfflineIds(): Set<string> {
  const downloads = useDownloads();
  return useMemo(() => offlineIds(downloads), [downloads]);
}

// Shared by every card on screen: one set per downloads snapshot.
let cached: { downloads: readonly DownloadItem[]; ids: Set<string> } | null = null;

function offlineIds(downloads: readonly DownloadItem[]): Set<string> {
  if (cached?.downloads === downloads) return cached.ids;
  const ids = new Set<string>();
  for (const d of downloads) if (d.status === "done") ids.add(d.metaId);
  for (const e of readLocalLibrary()) {
    ids.add(`local:${e.id}`);
    if (e.imdbId) ids.add(e.imdbId);
  }
  cached = { downloads, ids };
  return ids;
}

/** A small mark in a card's corner instead of a "Local only" label. */
export function OfflineMark({ className = "end-1.5 top-1.5" }: { className?: string }) {
  const t = useT();
  return (
    <span
      role="img"
      aria-label={t("Available offline")}
      className={`pointer-events-none absolute z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white ring-1 ring-white/15 backdrop-blur-sm ${className}`}
    >
      <ArrowDownToLine size={13} strokeWidth={2.6} />
    </span>
  );
}
