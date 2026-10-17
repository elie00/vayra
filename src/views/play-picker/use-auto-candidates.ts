import { useMemo } from "react";
import { isStreamDead } from "@/lib/dead-streams";
import { engineP2pEligible } from "@/lib/torrent/stremio-stream";
import type { ScoredStream } from "@/lib/streams/types";
import { streamMatchesEntry, streamMatchesSource, type PlaybackEntry } from "@/lib/playback-history";
import type { SourceDescriptor } from "@/lib/together/protocol";
import { buildMatchScores } from "@/lib/together/source-match";
import { hostSourceStream } from "@/lib/together/host-stream";
import { hasNativeStreamProxy } from "@/lib/stream-proxy";
import { hasInstantMarker, isWatchHub, needsDownload, streamMatchesLangs } from "./picker-utils";

const RES_PREF: Record<string, number> = { "1080p": 0, "720p": 1, "480p": 2, "4K": 3, SD: 4 };
const LIKELY_PACK_BYTES = 12 * 1024 * 1024 * 1024;

type AutoCandidateArgs = {
  filteredPicker: { all: ScoredStream[]; primary: ScoredStream | null } | null;
  previousPlayback: PlaybackEntry | null;
  sourceEntry: PlaybackEntry | null;
  isCached: (s: ScoredStream) => boolean;
  addons: Array<{ manifest?: { id?: string } }> | null;
  hasStrongAddon: boolean;
  isTorrentioStream: (s: ScoredStream) => boolean;
  preferredLangs: string[];
  hostSource?: SourceDescriptor | null;
  prefer1080?: boolean;
  preferPacks?: boolean;
  season?: number | null;
  episode?: number | null;
  /** P2P may start without asking: a torrent source can then lead like a cached one. */
  p2pAutoConsent?: boolean;
};

export function useAutoCandidates(args: AutoCandidateArgs): ScoredStream[] {
  const { filteredPicker, previousPlayback, sourceEntry, isCached, addons, hasStrongAddon, isTorrentioStream, preferredLangs, hostSource, prefer1080, preferPacks, season, episode, p2pAutoConsent } = args;
  return useMemo(
    () => buildAutoCandidates({ filteredPicker, previousPlayback, sourceEntry, isCached, addons, hasStrongAddon, isTorrentioStream, preferredLangs, hostSource, prefer1080, preferPacks, season, episode, p2pAutoConsent }),
    [filteredPicker, previousPlayback, sourceEntry, isCached, addons, hasStrongAddon, isTorrentioStream, preferredLangs, hostSource, prefer1080, preferPacks, season, episode, p2pAutoConsent],
  );
}

export function buildAutoCandidates(args: AutoCandidateArgs): ScoredStream[] {
  const { filteredPicker, previousPlayback, sourceEntry, isCached, addons, hasStrongAddon, isTorrentioStream, preferredLangs, hostSource, prefer1080, preferPacks, season, episode, p2pAutoConsent } = args;
  const hostFallback = (): ScoredStream[] => {
    if (!hostSource) return [];
    const hs = hostSourceStream(hostSource);
    return hs ? [hs] : [];
  };
  if (!filteredPicker) return hostFallback();
  const key = (s: ScoredStream) => s.url ?? s.infoHash ?? `${s.addonId}:${s.title ?? ""}`;
  const episodeConflict = (s: ScoredStream) => {
    if (episode == null || s.episode == null) return false;
    if (s.episode !== episode) return true;
    return season != null && s.season != null && s.season !== season;
  };
  const episodeExact = (s: ScoredStream) =>
    episode != null &&
    s.episode === episode &&
    (season == null || s.season == null || s.season === season);
  const instantTier = (s: ScoredStream) => {
    if (!isCached(s)) return 2;
    return episodeExact(s) ? 0 : 1;
  };
  const isLikelyPack = (s: ScoredStream) => {
    if (episode == null) return false;
    if (s.seasonPack) return true;
    if (episodeExact(s)) return false;
    return s.size != null && s.size > LIKELY_PACK_BYTES;
  };
  const addonRank = new Map<string, number>();
  (addons ?? []).forEach((a, i) => {
    if (a.manifest?.id) addonRank.set(a.manifest.id, i);
  });
  const matchScores = hostSource ? buildMatchScores(filteredPicker.all, hostSource) : null;
  const previousMatch = previousPlayback
    ? filteredPicker.all.find((s) => streamMatchesEntry(s, previousPlayback)) ?? null
    : null;
  const preferWebReady = !hasNativeStreamProxy();
  const sorted = filteredPicker.all.slice().sort((a, b) => {
    if (matchScores) {
      const dm = (matchScores.get(b) ?? 0) - (matchScores.get(a) ?? 0);
      if (dm !== 0) return dm;
    }
    const aw = isWatchHub(a) ? 1 : 0;
    const bw = isWatchHub(b) ? 1 : 0;
    if (aw !== bw) return aw - bw;
    if (preferWebReady) {
      const ar = a.behaviorHints?.notWebReady === true ? 1 : 0;
      const br = b.behaviorHints?.notWebReady === true ? 1 : 0;
      if (ar !== br) return ar - br;
    }
    const ai0 = instantTier(a);
    const bi0 = instantTier(b);
    if (ai0 !== bi0) return ai0 - bi0;
    const ap = isLikelyPack(a) ? 1 : 0;
    const bp = isLikelyPack(b) ? 1 : 0;
    if (ap !== bp) return preferPacks ? bp - ap : ap - bp;
    const ad = needsDownload(a) ? 1 : 0;
    const bd = needsDownload(b) ? 1 : 0;
    if (ad !== bd) return ad - bd;
    if (prefer1080) {
      const dr = (RES_PREF[a.resolution] ?? 5) - (RES_PREF[b.resolution] ?? 5);
      if (dr !== 0) return dr;
    }
    if (hasStrongAddon) {
      const at = isTorrentioStream(a) ? 1 : 0;
      const bt = isTorrentioStream(b) ? 1 : 0;
      if (at !== bt) return at - bt;
    }
    if (preferredLangs.length > 0) {
      const al = streamMatchesLangs(a, preferredLangs) ? 0 : 1;
      const bl = streamMatchesLangs(b, preferredLangs) ? 0 : 1;
      if (al !== bl) return al - bl;
    }
    const ar = addonRank.get(a.addonId) ?? 9999;
    const br = addonRank.get(b.addonId) ?? 9999;
    if (ar !== br) return ar - br;
    const ai = hasInstantMarker(a) ? 1 : 0;
    const bi = hasInstantMarker(b) ? 1 : 0;
    if (ai !== bi) return bi - ai;
    return 0;
  });
  const out: ScoredStream[] = [];
  const seen = new Set<string>();
  const push = (s: ScoredStream | null | undefined) => {
    if (!s) return;
    if (isStreamDead(s)) return;
    if (isWatchHub(s)) return;
    if (episodeConflict(s)) return;
    if (!isCached(s) && !s.url && !engineP2pEligible(s)) return;
    const k = key(s);
    if (seen.has(k)) return;
    // The same torrent offered by two add-ons is one swarm: a retry after it stalled
    // must move to another source, not play it again. A debrid-cached link stays apart.
    const swarm = !isCached(s) && s.infoHash ? `swarm:${s.infoHash.toLowerCase()}` : null;
    if (swarm && seen.has(swarm)) return;
    seen.add(k);
    if (swarm) seen.add(swarm);
    out.push(s);
  };
   const sourceMatch =
    sourceEntry ? filteredPicker.all.find((s) => streamMatchesSource(s, sourceEntry)) ?? null : null;
  const instantPlayable = (s: ScoredStream | null) => !!s && (isCached(s) || !!s.url);
  // The series' source leads the next episode, a plain torrent too when P2P may
  // start on its own: otherwise a cached link of another source played instead.
  const sourcePlayable = (s: ScoredStream | null) => instantPlayable(s) || (!!s && !!p2pAutoConsent && engineP2pEligible(s));
  if (!matchScores) {
    if (sourcePlayable(sourceMatch)) push(sourceMatch);
    if (instantPlayable(previousMatch)) push(previousMatch);
  }
  // Fail rather than guess: a source that declares only other audio languages is
  // never started on its own. A room follows the host's source whatever its language.
  const langConflict = (s: ScoredStream) =>
    !hostSource && preferredLangs.length > 0 && !streamMatchesLangs(s, preferredLangs);
  for (const s of sorted) if (!langConflict(s)) push(s);
  if (out.length > 0) return out;
  const synthetic = hostFallback();
  if (synthetic.length > 0) return synthetic;
  if (hostSource) {
    const ownBest = sorted.find(
      (s) => !isStreamDead(s) && !isWatchHub(s) && !episodeConflict(s),
    );
    if (ownBest) return [ownBest];
  }
  return [];
}
