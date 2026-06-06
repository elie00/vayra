import { safeFetch as fetch } from "@/lib/safe-fetch";
import { dwarn } from "@/lib/debug";
import { magnetFromHash, type DebridResult, type DebridStore, type DirectLink } from "@/lib/debrid/types";
import { probeStremioServer } from "@/lib/stremio-server";
import {
  buildTorrentStreamUrl,
  createAndListFiles,
  directTorrentEnabled,
  trackersFromSources,
} from "@/lib/torrent/stremio-stream";
import type { ParsedStream, ScoredStream } from "./types";

export type ResolveResult =
  | { ok: true; data: DirectLink; via: string }
  | { ok: false; code: string; tried: Array<{ slug: string; code: string }> };

const ERROR_VIDEO_MAX_BYTES = 80 * 1024 * 1024;

export async function resolveStream(
  stream: ParsedStream | ScoredStream,
  debrids: DebridStore[],
  signal: AbortSignal,
  userCommitted = false,
): Promise<ResolveResult> {
  const expectedSize = stream.size ?? null;
  const tried: Array<{ slug: string; code: string }> = [];

  if (stream.url && stream.url !== "#") {
    const headers = stream.behaviorHints?.proxyHeaders?.request ?? stream.behaviorHints?.headers;
    const filename = stream.behaviorHints?.filename ?? stream.behaviorHints?.fileName;
    const data: DirectLink = {
      url: stream.url,
      filename,
      filesize: stream.behaviorHints?.videoSize,
      headers,
      notWebReady: stream.behaviorHints?.notWebReady,
      subtitles: stream.subtitles?.map((s) => ({ url: s.url, lang: s.lang, id: s.id })),
    };
    const ok = await validateLink(data, expectedSize, headers, signal, false);
    if (ok) return { ok: true, data, via: "direct" };
    tried.push({ slug: "direct", code: "stub-or-error-video" });
    if (debrids.length === 0 || !stream.infoHash) {
      return { ok: false, code: "stub-or-error-video", tried };
    }
  }
  if (stream.url === "#") {
    return { ok: false, code: "addon-not-configured", tried: [] };
  }
  if (stream.externalUrl) {
    return { ok: false, code: "external-url-only", tried: [] };
  }
  if (stream.ytId) {
    return { ok: false, code: "youtube-only", tried: [] };
  }
  if (stream.nzbUrl) {
    return { ok: false, code: "nzb-needs-external-player", tried: [] };
  }
  if (!stream.infoHash) {
    return { ok: false, code: "no-source", tried };
  }
  if (debrids.length === 0) {
    const direct = await tryStremioServer(stream);
    if (direct) return { ok: true, data: direct, via: "stremio-server" };
    return { ok: false, code: "no-debrid-configured", tried };
  }
  const sorted = sortDebridsForStream(stream, debrids);
  if (!userCommitted) {
    const cachedMap = stream.cached ?? {};
    const libMap = (stream as { inLibrary?: Record<string, boolean> }).inLibrary ?? {};
    if (!sorted.some((d) => cachedMap[d.slug] === true || libMap[d.slug] === true)) {
      return { ok: false, code: "uncached-not-committed", tried };
    }
  }
  const magnet = magnetFromHash(stream.infoHash);
  for (const d of sorted) {
    if (signal.aborted) {
      return { ok: false, code: "aborted", tried };
    }
    const r: DebridResult<DirectLink> = await d.playableUrl(magnet, stream.fileIdx, signal);
    if (!r.ok) {
      tried.push({ slug: d.slug, code: r.code });
      if (r.code === "aborted") return { ok: false, code: "aborted", tried };
      continue;
    }
    const ok = await validateLink(r.data, expectedSize, r.data.headers, signal);
    if (ok) return { ok: true, data: r.data, via: d.slug };
    dwarn(`[resolve] ${d.slug} returned suspicious link (likely error/downloading video), trying next debrid`);
    tried.push({ slug: d.slug, code: "stub-or-error-video" });
  }
  return { ok: false, code: tried[tried.length - 1]?.code ?? "all-debrids-failed", tried };
}

async function validateLink(
  link: DirectLink,
  expectedSize: number | null,
  headers: Record<string, string> | undefined,
  signal: AbortSignal,
  allowNetwork = true,
): Promise<boolean> {
  if (link.filesize != null && link.filesize > 0) {
    if (link.filesize < ERROR_VIDEO_MAX_BYTES) {
      if (expectedSize == null || expectedSize > ERROR_VIDEO_MAX_BYTES) {
        return false;
      }
    }
    if (expectedSize != null && link.filesize < expectedSize * 0.4 && expectedSize > 100 * 1024 * 1024) {
      return false;
    }
    return true;
  }
  if (!allowNetwork) return true;
  try {
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    signal.addEventListener("abort", onAbort);
    const timer = setTimeout(() => ac.abort(), 5000);
    const headRes = await fetch(link.url, {
      method: "HEAD",
      headers: headers ?? {},
      signal: ac.signal,
    }).finally(() => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    });
    if (!headRes.ok) return true;
    const lenStr = headRes.headers.get("content-length");
    if (!lenStr) return true;
    const len = parseInt(lenStr, 10);
    if (!Number.isFinite(len) || len <= 0) return true;
    if (len < ERROR_VIDEO_MAX_BYTES && (expectedSize == null || expectedSize > ERROR_VIDEO_MAX_BYTES)) {
      return false;
    }
    if (expectedSize != null && len < expectedSize * 0.4 && expectedSize > 100 * 1024 * 1024) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

function sortDebridsForStream(stream: ParsedStream | ScoredStream, debrids: DebridStore[]): DebridStore[] {
  return debrids.slice().sort((a, b) => {
    const aCached = stream.cached[a.slug] ? 1 : 0;
    const bCached = stream.cached[b.slug] ? 1 : 0;
    return bCached - aCached;
  });
}

export async function resolveViaDebrids(
  hash: string,
  fileIdx: number | undefined,
  cached: Record<string, boolean>,
  debrids: DebridStore[],
  signal: AbortSignal,
  userCommitted = false,
): Promise<ResolveResult> {
  if (!hash || debrids.length === 0) return { ok: false, code: "no-debrid-configured", tried: [] };
  const stream = { infoHash: hash, fileIdx, cached } as unknown as ScoredStream;
  const sorted = sortDebridsForStream(stream, debrids);
  if (!userCommitted && !sorted.some((d) => cached[d.slug] === true)) {
    return { ok: false, code: "uncached-not-committed", tried: [] };
  }
  const magnet = magnetFromHash(hash);
  const tried: Array<{ slug: string; code: string }> = [];
  for (const d of sorted) {
    if (signal.aborted) return { ok: false, code: "aborted", tried };
    const r: DebridResult<DirectLink> = await d.playableUrl(magnet, fileIdx, signal);
    if (!r.ok) {
      tried.push({ slug: d.slug, code: r.code });
      if (r.code === "aborted") return { ok: false, code: "aborted", tried };
      continue;
    }
    const ok = await validateLink(r.data, null, r.data.headers, signal);
    if (ok) return { ok: true, data: r.data, via: d.slug };
    tried.push({ slug: d.slug, code: "stub-or-error-video" });
  }
  return { ok: false, code: tried[tried.length - 1]?.code ?? "all-debrids-failed", tried };
}

async function tryStremioServer(stream: ParsedStream | ScoredStream): Promise<DirectLink | null> {
  if (!stream.infoHash || !directTorrentEnabled()) return null;
  const ready = await probeStremioServer();
  if (!ready) return null;
  const filename = stream.behaviorHints?.filename ?? stream.behaviorHints?.fileName ?? null;
  await createAndListFiles(stream.infoHash, trackersFromSources(stream.sources));
  return {
    url: buildTorrentStreamUrl({
      infoHash: stream.infoHash,
      fileIdx: stream.fileIdx,
      sources: stream.sources,
      filename,
    }),
    filename: filename ?? undefined,
    notWebReady: stream.behaviorHints?.notWebReady,
    subtitles: stream.subtitles?.map((s) => ({ url: s.url, lang: s.lang, id: s.id })),
  };
}
