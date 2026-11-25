import { useEffect, useMemo, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { isPartWatched, subscribeWatchedFlags } from "@/lib/watched-flag";

export type CollectionProgress = {
  watchedCount: number;
  totalCount: number;
  releasedCount: number;
  complete: boolean;
  ratio: number;
  nextUnwatched: Meta | null;
};

function isReleased(part: Meta, todayIso: string): boolean {
  if (!part.releaseDate) return true;
  return part.releaseDate <= todayIso;
}

export function computeCollectionProgress(parts: Meta[], todayIso?: string): CollectionProgress {
  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  const released = parts.filter((p) => isReleased(p, today));
  const pool = released.length > 0 ? released : parts;
  let watchedCount = 0;
  let nextUnwatched: Meta | null = null;
  for (const part of pool) {
    if (isPartWatched(part.id, part.type)) {
      watchedCount += 1;
    } else if (!nextUnwatched) {
      nextUnwatched = part;
    }
  }
  const denom = pool.length;
  return {
    watchedCount,
    totalCount: parts.length,
    releasedCount: denom,
    complete: denom > 0 && watchedCount >= denom,
    ratio: denom > 0 ? Math.min(1, watchedCount / denom) : 0,
    nextUnwatched,
  };
}

export function useCollectionProgress(parts: Meta[]): CollectionProgress {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeWatchedFlags(() => setTick((n) => n + 1)), []);
  return useMemo(() => {
    void tick;
    return computeCollectionProgress(parts);
  }, [parts, tick]);
}
