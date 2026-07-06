import { useEffect, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useMal } from "@/lib/mal/provider";
import { fetchMalList } from "@/lib/mal/lists";
import type { MalListEntry, MalListStatus } from "@/lib/mal/types";

export type MalRail = { key: string; title: string; metas: Meta[] };

const RAIL_ORDER: Array<{ key: string; title: string; statuses: MalListStatus[] }> = [
  { key: "watching", title: "Watching", statuses: ["watching"] },
  { key: "planning", title: "Plan to Watch", statuses: ["plan_to_watch"] },
];

const MIN_PER_RAIL = 1;

function malEntryToMeta(entry: MalListEntry): Meta | null {
  const name = entry.anime.title;
  if (!name) return null;
  return {
    id: `mal:${entry.anime.id}`,
    type: "series",
    name,
    poster: entry.anime.mainPicture ?? undefined,
    releaseInfo: undefined,
    imdbRating: entry.anime.mean != null ? (entry.anime.mean / 10).toFixed(1) : undefined,
  };
}

export function useMalAnimeRails(): MalRail[] {
  const { isConnected } = useMal();
  const [rails, setRails] = useState<MalRail[]>([]);

  useEffect(() => {
    if (!isConnected) {
      setRails([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const groups = await fetchMalList();
      if (cancelled) return;
      const entriesByStatus = new Map(groups.map((g) => [g.status, g.entries]));

      const out: MalRail[] = [];
      for (const rail of RAIL_ORDER) {
        const entries = rail.statuses.flatMap((s) => entriesByStatus.get(s) ?? []);
        const metas = entries.map(malEntryToMeta).filter((m): m is Meta => m != null);
        if (metas.length >= MIN_PER_RAIL) out.push({ key: rail.key, title: rail.title, metas });
      }

      if (!cancelled) setRails(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected]);

  return rails;
}
