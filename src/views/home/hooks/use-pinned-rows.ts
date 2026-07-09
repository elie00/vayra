import { useEffect, useMemo, useState } from "react";
import { usePinnedCatalogs } from "@/lib/pinned-catalogs";
import { buildPinnedCatalogRows, pinnedRowKey } from "@/lib/pinned-catalogs-rows";
import { useAnilistAnimeRails } from "@/lib/use-anilist-anime-rails";
import type { HomeRow } from "../home-types";

export function usePinnedRows(): HomeRow[] {
  const pinned = usePinnedCatalogs();
  const anilistRails = useAnilistAnimeRails();
  const [catalogRows, setCatalogRows] = useState<HomeRow[]>([]);

  const catalogKey = pinned
    .filter((p) => p.source === "catalog")
    .map((p) => p.id)
    .join("|");

  useEffect(() => {
    let cancelled = false;
    buildPinnedCatalogRows(pinned)
      .then((rows) => {
        if (!cancelled) setCatalogRows(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [catalogKey]);

  return useMemo(() => {
    const catalogById = new Map<string, HomeRow>();
    for (const r of catalogRows) catalogById.set(r.key, r);
    const out: HomeRow[] = [];
    for (const desc of pinned) {
      const key = pinnedRowKey(desc.id);
      if (desc.source === "catalog") {
        const row = catalogById.get(key);
        if (row) out.push(row);
      } else if (desc.source === "anilist") {
        const rail = anilistRails.find((r) => r.key === desc.params.railKey);
        if (rail && rail.metas.length > 0) {
          out.push({
            key,
            type: "series",
            name: desc.name,
            metas: rail.metas,
            page: 1,
            hasMore: false,
            noDedup: true,
          });
        }
      }
    }
    return out;
  }, [pinned, catalogRows, anilistRails]);
}
