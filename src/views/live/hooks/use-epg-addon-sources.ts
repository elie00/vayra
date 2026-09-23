import { useEffect, useState } from "react";
import { gatherCatalogAddons } from "@/lib/addons";
import { useAuth } from "@/lib/auth";
import { epgAddonSources } from "@/lib/iptv/addon-guide";
import type { IptvPlaylistSource } from "@/lib/iptv/types";

let known: IptvPlaylistSource[] = [];

/** Live sources for the installed addons that provide a native EPG. */
export function useEpgAddonSources(active: boolean): IptvPlaylistSource[] {
  const { authKey } = useAuth();
  const [sources, setSources] = useState<IptvPlaylistSource[]>(known);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    gatherCatalogAddons(authKey)
      .then((addons) => {
        if (cancelled) return;
        known = epgAddonSources(addons);
        setSources(known);
      })
      .catch(() => {
        // Without the addon list, Live keeps its IPTV playlists only.
      });
    return () => {
      cancelled = true;
    };
  }, [active, authKey]);
  return sources;
}
