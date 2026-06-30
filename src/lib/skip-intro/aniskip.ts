import { safeFetch as fetch } from "@/lib/safe-fetch";
import type { SkipSegment } from "./types";

const malCache = new Map<number, number | null>();
const segmentCache = new Map<string, SkipSegment[]>();
const inflight = new Map<string, Promise<SkipSegment[]>>();

export async function kitsuToMal(kitsuId: number): Promise<number | null> {
  if (malCache.has(kitsuId)) return malCache.get(kitsuId)!;
  const res = await fetch(`https://kitsu.io/api/edge/anime/${kitsuId}/mappings`);
  if (!res.ok) {
    malCache.set(kitsuId, null);
    return null;
  }
  const json = (await res.json()) as {
    data?: Array<{ attributes?: { externalSite?: string; externalId?: string } }>;
  };
  const mal = json.data?.find((d) => d.attributes?.externalSite === "myanimelist/anime");
  const id = mal?.attributes?.externalId ? parseInt(mal.attributes.externalId, 10) : null;
  const out = Number.isFinite(id) ? (id as number) : null;
  malCache.set(kitsuId, out);
  return out;
}

export function fetchAniSkipSegments(
  malId: number,
  episode: number,
  episodeLengthSec = 0,
): Promise<SkipSegment[]> {
  const key = `${malId}:${episode}:${Math.round(episodeLengthSec)}`;
  const hit = segmentCache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = (async () => {
    const params = new URLSearchParams();
    for (const t of ["op", "ed", "mixed-op", "mixed-ed", "recap"]) params.append("types", t);
    params.set("episodeLength", String(Math.round(episodeLengthSec)));
    const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      segmentCache.set(key, []);
      return [];
    }
    const json = (await res.json()) as {
      found?: boolean;
      results?: Array<{
        interval?: { startTime?: number; endTime?: number };
        skipType?: string;
      }>;
    };
    if (!json.found || !json.results) {
      segmentCache.set(key, []);
      return [];
    }
    const segments: SkipSegment[] = [];
    for (const r of json.results) {
      const start = r.interval?.startTime;
      const end = r.interval?.endTime;
      const t = r.skipType ?? "";
      if (typeof start !== "number" || typeof end !== "number" || end <= start) continue;
      const kind: SkipSegment["kind"] = t === "ed" || t === "mixed-ed" ? "outro" : t === "recap" ? "recap" : "intro";
      segments.push({ kind, startSec: start, endSec: end, source: "aniskip" });
    }
    segments.sort((a, b) => a.startSec - b.startSec);
    segmentCache.set(key, segments);
    return segments;
  })()
    .catch((): SkipSegment[] => [])
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}
