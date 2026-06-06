import { useEffect, useState } from "react";
import { fetchInstalledAddons } from "@/lib/addon-store";
import {
  torboxAddonFor,
  userAddons,
  withDebridKeys,
  type Addon,
} from "@/lib/addons";
import type { useSettings } from "@/lib/settings";

type Settings = ReturnType<typeof useSettings>["settings"];

export function useAddons(authKey: string | null, settings: Settings): {
  addons: Addon[] | null;
  userHasStreamAddons: boolean;
} {
  const [addons, setAddons] = useState<Addon[] | null>(null);
  const [userHasStreamAddons, setUserHasStreamAddons] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const debridKeys = {
      rdKey: settings.rdKey,
      tbKey: settings.tbKey,
      adKey: settings.adKey,
      pmKey: settings.pmKey,
      dlKey: settings.dlKey,
    };
    const torbox = torboxAddonFor(settings.tbKey);
    (async () => {
      const stremioAddons = authKey ? await userAddons(authKey).catch(() => []) : [];
      const installed = await fetchInstalledAddons().catch(() => []);
      if (cancelled) return;
      const merged: Addon[] = [];
      const seen = new Set<string>();
      for (const a of [...installed, ...stremioAddons]) {
        if (seen.has(a.transportUrl)) continue;
        seen.add(a.transportUrl);
        merged.push(a);
      }
      const userStreamCount = merged.filter((a) =>
        (a.manifest.resources ?? []).some((r) =>
          typeof r === "string" ? r === "stream" : r.name === "stream",
        ),
      ).length;
      setUserHasStreamAddons(userStreamCount > 0);
      const list = withDebridKeys(merged, debridKeys);
      const existingTorboxIdx = list.findIndex(
        (a) =>
          a.manifest.id === "app.torbox.stremio" ||
          a.transportUrl?.includes("stremio.torbox.app"),
      );
      console.info(
        `[picker] tbKey=${settings.tbKey ? `set(${settings.tbKey.slice(0, 8)}…)` : "EMPTY"} stremioAddons=${stremioAddons.length} installed=${installed.length} hasTorbox=${existingTorboxIdx >= 0} torboxAutoAddable=${!!torbox}`,
      );
      if (torbox) {
        if (existingTorboxIdx >= 0) {
          const existing = list[existingTorboxIdx];
          if (existing.transportUrl !== torbox.transportUrl) {
            console.info(
              `[picker] overriding stale TorBox URL: ${existing.transportUrl} → ${torbox.transportUrl}`,
            );
            list[existingTorboxIdx] = torbox;
          }
        } else {
          console.info(`[picker] auto-adding TorBox addon: ${torbox.transportUrl}`);
          list.push(torbox);
        }
      }
      console.info(
        `[picker] final addon list (${list.length}): ${list.map((a) => a.manifest.name).join(", ")}`,
      );
      setAddons(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [authKey, settings.rdKey, settings.tbKey, settings.adKey, settings.pmKey, settings.dlKey]);

  return { addons, userHasStreamAddons };
}
