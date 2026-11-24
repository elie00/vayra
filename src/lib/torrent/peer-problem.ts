import type { EngineStats } from "./engine-stats";

/** Why a torrent shows nothing yet, when the engine's peer counters can tell. */
export type PeerProblem = "none-found" | "all-lost";

// PROVISIONAL (#225): this delay waits for the HiggsBoson recette (#224), which
// reads the engine's `[torrent-engine] peers` log on a poor swarm. Until then
// it follows the loader's "taking a while" hint (20 s).
export const PEER_PROBLEM_AFTER_MS = 20_000;

/**
 * "none-found" when the peer search runs but has found no peer at all;
 * "all-lost" when peers were found and every one of them has ended (failed or
 * no longer needed), none live, queued or connecting. Null otherwise: too
 * early, a peer live or data flowing, the search not running (checking files,
 * paused), the torrent finished, or an engine that does not count peers.
 * Neither case blames debrid or the add-ons: it is about this torrent's swarm.
 *
 * `previous` is the verdict shown so far: a failed peer is queued again after
 * its back-off, so "all-lost" holds through those retries until a peer is live
 * or data flows, instead of blinking.
 */
export function peerProblem(
  stats: EngineStats | null | undefined,
  elapsedMs: number,
  previous: PeerProblem | null = null,
): PeerProblem | null {
  if (!stats || elapsedMs < PEER_PROBLEM_AFTER_MS) return null;
  if (stats.finished || !stats.peerSearchRunning) return null;
  const live = stats.unchoked > 0 ? stats.unchoked : stats.peers;
  if (live > 0 || stats.downloadSpeed > 0) return null;
  // Engines without these counters (the Stremio server) never get a verdict.
  if (stats.peersSeen == null || stats.peersTrying == null) return null;
  if (stats.peersSeen === 0) return "none-found";
  if (stats.peersTrying === 0) return "all-lost";
  return previous === "all-lost" ? "all-lost" : null;
}
