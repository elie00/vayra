import { useMemo } from "react";
import type { Meta } from "@/lib/cinemeta";
import type { FranchiseEntry } from "@/lib/providers/anime-detail";
import type { PickerItem } from "../series-episodes/season-arc-picker";
import type { AnimeTvdbPanel } from "./use-anime-tvdb-panel";

function entryBadge(f: FranchiseEntry): string | undefined {
  if (f.meta.type === "movie") return "Movie";
  const sub = (f.subtype ?? "").toLowerCase();
  if (sub === "ova") return "OVA";
  if (sub === "ona") return "ONA";
  if (sub === "special") return "Special";
  if (sub === "music") return "Music";
  return undefined;
}

export function useAnimePanelExtras(
  panel: AnimeTvdbPanel | null,
  franchise: FranchiseEntry[],
  currentId: string,
  openMeta: (meta: Meta, opts?: { exact?: boolean }) => void,
): AnimeTvdbPanel | null {
  const navItems = useMemo<PickerItem[]>(
    () =>
      franchise.length > 1
        ? franchise
            .filter((f) => f.meta.id !== currentId)
            .map((f) => ({
              key: `nav:${f.meta.id}`,
              name: f.meta.name,
              count: f.episodeCount ?? 0,
              year: f.startDate?.slice(0, 4),
              extra: true,
              badge: entryBadge(f),
            }))
        : [],
    [franchise, currentId],
  );

  return useMemo(() => {
    if (!panel || navItems.length === 0) return panel;
    const onSelect = (key: string) => {
      if (key.startsWith("nav:")) {
        const entry = franchise.find((f) => f.meta.id === key.slice(4));
        if (entry) openMeta(entry.meta, { exact: true });
        return;
      }
      panel.onSelect(key);
    };
    return { ...panel, items: [...panel.items, ...navItems], onSelect };
  }, [panel, navItems, franchise, openMeta]);
}
