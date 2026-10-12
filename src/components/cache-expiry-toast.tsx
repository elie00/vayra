import { HardDrive } from "lucide-react";
import { useEffect, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { activeDownloadFor } from "@/lib/download/downloads-store";
import { useT } from "@/lib/i18n";
import { localCwEntry } from "@/lib/local-cw";
import { playbackForFile } from "@/lib/playback-history";
import { currentPlatformCapabilities } from "@/lib/platform-capabilities";
import {
  expiringSoon,
  keepCachedFile,
  markCachedFileWarned,
  playbackStreamLabel,
  useCachedEngineFiles,
  type CachedEngineFile,
} from "@/lib/torrent/engine-cache";
import type { PlayEpisode } from "@/lib/view";

const PLATFORM_CAPABILITIES = currentPlatformCapabilities();

type Notice = {
  file: CachedEngineFile;
  meta: Meta;
  episode?: PlayEpisode;
  label: string | null;
  title: string;
};

/** Offer to keep a complete file the cache sweep is about to remove. */
export function CacheExpiryToast() {
  const t = useT();
  const files = useCachedEngineFiles();
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (notice || !PLATFORM_CAPABILITIES.nativeDownloads) return;
    for (const file of expiringSoon(files, Date.now())) {
      // Each file is announced at most once, whether or not there is anything to offer.
      markCachedFileWarned(file);
      const played = playbackForFile(file.info_hash, file.file_idx);
      if (!played) continue;
      const saved = activeDownloadFor(played.metaId, played.season ?? null, played.episode ?? null);
      if (saved && saved.status !== "canceled" && saved.status !== "error") continue;
      const known = localCwEntry(played.metaId);
      const episode = played.season != null && played.episode != null
        ? { season: played.season, episode: played.episode }
        : undefined;
      const name = known?.name || file.name.replace(/\.[^.]+$/, "");
      const meta: Meta = {
        id: played.metaId,
        type: episode ? "series" : "movie",
        name,
        poster: known?.poster,
      };
      const tag = episode
        ? ` · S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`
        : "";
      setNotice({ file, meta, episode, label: playbackStreamLabel(played.entry), title: `${name}${tag}` });
      return;
    }
  }, [files, notice]);

  if (!notice) return null;
  const minutes = Math.max(1, Math.round(((notice.file.expires_at_ms ?? Date.now()) - Date.now()) / 60_000));
  const keep = () => {
    const shown = notice;
    setNotice(null);
    // When the save cannot start, bring the offer back to retry or dismiss it.
    const restore = () => setNotice(shown);
    void keepCachedFile(shown.file, shown.meta, shown.episode, shown.label)
      .then((kept) => kept || restore())
      .catch(restore);
  };

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[130] flex justify-center px-6">
      <div className="harbor-together-pill pointer-events-auto flex max-w-full items-center gap-3 rounded-full border border-edge bg-surface/98 py-2 ps-2.5 pe-2 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.75)] animate-popover-in">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <HardDrive size={14} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 truncate text-[12.5px] font-semibold text-ink">
          {t("{title} leaves the cache in {minutes} min", { title: notice.title, minutes })}
        </span>
        <button
          type="button"
          onClick={keep}
          className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-canvas transition-opacity hover:opacity-90"
        >
          {t("Keep")}
        </button>
        <button
          type="button"
          onClick={() => setNotice(null)}
          className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
        >
          {t("Dismiss")}
        </button>
      </div>
    </div>
  );
}
