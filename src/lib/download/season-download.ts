import type { Meta } from "@/lib/cinemeta";
import { magnetFromHash, type DebridStore } from "@/lib/debrid/types";
import { matchEpisodeFileIndex } from "@/lib/streams/episode-file";
import { resolveStream } from "@/lib/streams/resolve";
import type { ScoredStream } from "@/lib/streams/types";
import { torrentEngineAdd, torrentEngineSelectMany } from "@/lib/torrent/local-engine";
import { isVideoFile, localTorrentAllowed, trackersFromSources } from "@/lib/torrent/stremio-stream";
import type { PlayEpisode } from "@/lib/view";
import { activeDownloadFor, enqueueDownload } from "./downloads-store";

export type SeasonDownloadProgress = {
  total: number;
  done: number;
  queued: number;
  skipped: number;
  failed: number;
  current: PlayEpisode | null;
};

export function seasonPackEligible(stream: ScoredStream): boolean {
  return !!stream.infoHash;
}

export function seasonStreamLabel(stream: ScoredStream): string | null {
  return (
    [stream.resolution, stream.source].filter(Boolean).join(" ") ||
    stream.parsedTitle ||
    stream.title ||
    stream.name ||
    stream.addonName ||
    null
  );
}

// A pack stream returned for one episode carries that episode's identity: a ready
// `url`, a `fileIdx`, a filename hint and the pack's total size. Strip all of it so
// the resolver re-picks a file per episode from the episode hint, and so the size
// check compares against a single file instead of the whole pack.
function neutralizePackStream(stream: ScoredStream): ScoredStream {
  const behaviorHints = stream.behaviorHints ? { ...stream.behaviorHints } : undefined;
  if (behaviorHints) {
    delete behaviorHints.filename;
    delete behaviorHints.fileName;
    delete behaviorHints.videoSize;
  }
  return {
    ...stream,
    url: undefined,
    fileIdx: undefined,
    behaviorHints,
    size: null,
    season: null,
    episode: null,
  };
}

/**
 * Queue every episode of a season from a single torrent. Resolution runs one
 * episode at a time: the debrid is asked for the same magnet repeatedly, only the
 * episode hint changes, so each call returns that episode's file inside the pack.
 */
export async function runSeasonDownload(args: {
  meta: Meta;
  stream: ScoredStream;
  episodes: PlayEpisode[];
  debrids: DebridStore[];
  signal: AbortSignal;
  onProgress?: (p: SeasonDownloadProgress) => void;
}): Promise<SeasonDownloadProgress> {
  const { meta, stream, episodes, debrids, signal, onProgress } = args;
  const label = seasonStreamLabel(stream);
  const base = neutralizePackStream(stream);
  const p: SeasonDownloadProgress = {
    total: episodes.length,
    done: 0,
    queued: 0,
    skipped: 0,
    failed: 0,
    current: null,
  };
  const emit = () => onProgress?.({ ...p });

  if (debrids.length === 0) return runLocalEngineSeasonDownload({ ...args, label, p, emit });

  for (const ep of episodes) {
    if (signal.aborted) break;
    p.current = ep;
    emit();

    const existing = activeDownloadFor(meta.id, ep.season, ep.episode);
    if (existing && (existing.status === "downloading" || existing.status === "done")) {
      p.skipped += 1;
      p.done += 1;
      continue;
    }

    const r = await resolveStream(base, debrids, signal, true, false, {
      season: ep.season ?? null,
      episode: ep.episode ?? null,
      absolute: ep.absoluteEpisode ?? null,
    });
    if (signal.aborted) break;
    p.done += 1;
    if (!r.ok) {
      p.failed += 1;
      emit();
      continue;
    }
    await enqueueDownload({
      meta,
      episode: ep,
      streamLabel: label,
      url: r.data.url,
      headers: r.data.headers,
    });
    p.queued += 1;
    emit();
  }

  p.current = null;
  emit();
  return p;
}

/**
 * P2P variant. Without a debrid there is no per-episode link to ask for: the torrent
 * is added once, every wanted file is selected in a single call, and each file is then
 * pulled over HTTP from the engine. Selecting them together is what makes this work —
 * one-file-at-a-time selection would have each download deselect the previous one.
 */
async function runLocalEngineSeasonDownload(args: {
  meta: Meta;
  stream: ScoredStream;
  episodes: PlayEpisode[];
  signal: AbortSignal;
  label: string | null;
  p: SeasonDownloadProgress;
  emit: () => void;
}): Promise<SeasonDownloadProgress> {
  const { meta, stream, episodes, signal, label, p, emit } = args;
  if (!stream.infoHash || !localTorrentAllowed()) {
    p.failed = p.total;
    p.done = p.total;
    p.current = null;
    emit();
    return p;
  }

  const added = await torrentEngineAdd(
    magnetFromHash(stream.infoHash),
    trackersFromSources(stream.sources),
  );
  if (signal.aborted) return p;
  if (!added || added.files.length === 0) {
    p.failed = p.total;
    p.done = p.total;
    p.current = null;
    emit();
    return p;
  }

  const videos = added.files.filter(isVideoFile);
  const pool = videos.length > 0 ? videos : added.files;
  const names = pool.map((f) => f.name);

  // Resolve every episode to a file first: the engine selection has to name all of
  // them at once, so nothing can be queued before the whole mapping is known.
  const planned: Array<{ ep: PlayEpisode; idx: number }> = [];
  for (const ep of episodes) {
    const existing = activeDownloadFor(meta.id, ep.season, ep.episode);
    if (existing && (existing.status === "downloading" || existing.status === "done")) {
      p.skipped += 1;
      p.done += 1;
      continue;
    }
    const mi = matchEpisodeFileIndex(names, {
      season: ep.season ?? null,
      episode: ep.episode ?? null,
      absolute: ep.absoluteEpisode ?? null,
    });
    if (mi < 0) {
      p.failed += 1;
      p.done += 1;
      continue;
    }
    planned.push({ ep, idx: pool[mi].idx });
  }
  emit();

  if (planned.length === 0) {
    p.current = null;
    emit();
    return p;
  }

  const selected = await torrentEngineSelectMany(
    added.info_hash,
    planned.map((x) => x.idx),
  );
  if (signal.aborted) return p;
  if (!selected) {
    p.failed += planned.length;
    p.done += planned.length;
    p.current = null;
    emit();
    return p;
  }

  for (const { ep, idx } of planned) {
    if (signal.aborted) break;
    p.current = ep;
    emit();
    await enqueueDownload({
      meta,
      episode: ep,
      streamLabel: label,
      url: `${added.stream_base}/${added.info_hash.toLowerCase()}/${idx}`,
    });
    p.queued += 1;
    p.done += 1;
    emit();
  }

  p.current = null;
  emit();
  return p;
}
