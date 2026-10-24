import { filterEnabled, loadInstalled } from "@/lib/addon-store";
import { addonAccepts, userAddons, type Addon } from "@/lib/addons";
import { readActiveStremioAuthKey } from "@/lib/auth";
import { safeFetch as fetch } from "@/lib/safe-fetch";

// Stremio's addon events (stremio-core #1070): an addon that declares the
// `player` or `library` resource hears what is played and what changes in the
// library, which is how scrobblers work. Ids are catalogue ids only, never local
// files, magnet links or IPTV streams.

export type PlayerEventAction = "start" | "pause" | "stop";
export type LibraryEventAction = "libraryAdd" | "libraryRemove" | "watched" | "unwatched";

const VIDEOS_PER_EVENT = 100;
const ACCOUNT_ADDONS_TTL_MS = 5 * 60_000;

export function addonEventUrl(
  transportUrl: string,
  resource: "player" | "library",
  type: string,
  id: string,
  extra: Array<[string, string]>,
): string {
  const base = transportUrl.replace(/\/manifest\.json$/i, "").replace(/\/$/, "");
  const query = extra.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  return `${base}/${resource}/${encodeURIComponent(type)}/${encodeURIComponent(id)}/${query}.json`;
}

let accountAddons: { authKey: string; at: number; addons: Promise<Addon[]> } | null = null;

async function activeAddons(): Promise<Addon[]> {
  const authKey = readActiveStremioAuthKey();
  let fromAccount: Promise<Addon[]> = Promise.resolve([]);
  if (authKey) {
    if (!accountAddons || accountAddons.authKey !== authKey || Date.now() - accountAddons.at > ACCOUNT_ADDONS_TTL_MS) {
      accountAddons = { authKey, at: Date.now(), addons: userAddons(authKey).catch(() => []) };
    }
    fromAccount = accountAddons.addons;
  }
  const local = loadInstalled()
    .filter((a) => !!a.manifest)
    .map((a) => ({ manifest: a.manifest!, transportUrl: a.transportUrl }));
  const seen = new Set<string>();
  return filterEnabled([...(await fromAccount), ...local]).filter((a) => {
    if (seen.has(a.transportUrl)) return false;
    seen.add(a.transportUrl);
    return true;
  });
}

async function send(
  resource: "player" | "library",
  type: string,
  id: string,
  extras: Array<Array<[string, string]>>,
): Promise<void> {
  const addons = (await activeAddons()).filter((a) => addonAccepts(a, resource, type, id));
  await Promise.all(
    addons.flatMap((a) =>
      extras.map((extra) =>
        fetch(addonEventUrl(a.transportUrl, resource, type, id, extra), { signal: AbortSignal.timeout(10_000) }).catch(
          () => undefined,
        ),
      ),
    ),
  );
}

export function sendPlayerEvent(
  type: string,
  videoId: string,
  action: PlayerEventAction,
  currentSec: number,
  durationSec: number,
): Promise<void> {
  const ms = (sec: number) => String(Math.max(0, Math.round((Number.isFinite(sec) ? sec : 0) * 1000)));
  return send("player", type, videoId, [
    [
      ["action", action],
      ["currentTime", ms(currentSec)],
      ["duration", ms(durationSec)],
    ],
  ]);
}

/** A whole item, or some of its videos (sent 100 per request). */
export function sendLibraryEvent(
  type: string,
  id: string,
  action: LibraryEventAction,
  videoIds: string[] = [],
): Promise<void> {
  if (videoIds.length === 0) return send("library", type, id, [[["action", action]]]);
  const extras: Array<Array<[string, string]>> = [];
  for (let i = 0; i < videoIds.length; i += VIDEOS_PER_EVENT) {
    extras.push([
      ["action", action],
      ["videoId", videoIds.slice(i, i + VIDEOS_PER_EVENT).join(",")],
    ]);
  }
  return send("library", type, id, extras);
}

/** Episodes the user marked; only Cinemeta video ids (`tt…:season:episode`) are unambiguous. */
export function sendEpisodesWatchedEvent(
  seriesId: string,
  episodes: Array<{ season: number; episode: number }>,
  watched: boolean,
): Promise<void> {
  if (!seriesId.startsWith("tt") || episodes.length === 0) return Promise.resolve();
  const videoIds = episodes.map(({ season, episode }) => `${seriesId}:${season}:${episode}`);
  return sendLibraryEvent("series", seriesId, watched ? "watched" : "unwatched", videoIds);
}
