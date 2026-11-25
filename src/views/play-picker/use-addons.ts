import { useEffect, useState } from "react";
import {
  fetchInstalledAddons,
  fetchManifestAt,
  filterEnabled,
  loadInstalled,
} from "@/lib/addon-store";
import {
  peekUserAddons,
  torboxAddonFor,
  userAddonsCached,
  withDebridKeys,
  type Addon,
} from "@/lib/addons";
import { applyOrderToItems, loadDisplayOrder } from "@/lib/addons-store/reorder";
import type { useSettings } from "@/lib/settings";
import { mergeLiteStarterAddons } from "@/lib/lite/addon-pack";
import { isWeb } from "@/lib/platform";

type Settings = ReturnType<typeof useSettings>["settings"];

function hasAnyResources(a: Addon): boolean {
  return (a.manifest.resources ?? []).length > 0;
}

function declaresStream(a: Addon): boolean {
  return (a.manifest.resources ?? []).some((r) =>
    typeof r === "string" ? r === "stream" : r.name === "stream",
  );
}

async function resolveManifests(addons: Addon[]): Promise<Addon[]> {
  return Promise.all(
    addons.map(async (a) => {
      if (hasAnyResources(a)) return a;
      const manifest = await fetchManifestAt(a.transportUrl).catch(() => null);
      return manifest ? { ...a, manifest } : a;
    }),
  );
}

function finalizeAddonList(
  stremioAddons: Addon[],
  installed: Addon[],
  settings: Settings,
): { list: Addon[]; userHasStreamAddons: boolean } {
  const debridKeys = {
    rdKey: settings.rdKey,
    tbKey: settings.tbKey,
    adKey: settings.adKey,
    pmKey: settings.pmKey,
    dlKey: settings.dlKey,
  };
  const torbox = torboxAddonFor(settings.tbKey);
  const sourceAddons = isWeb()
    ? filterEnabled(
        mergeLiteStarterAddons(
          [...stremioAddons, ...installed],
          debridKeys,
          settings.preferredLanguages,
        ),
      )
    : [...stremioAddons, ...installed];
  const merged: Addon[] = [];
  const idxByUrl = new Map<string, number>();
  for (const a of sourceAddons) {
    const existingIdx = idxByUrl.get(a.transportUrl);
    if (existingIdx === undefined) {
      idxByUrl.set(a.transportUrl, merged.length);
      merged.push(a);
      continue;
    }
    if (!hasAnyResources(merged[existingIdx]) && hasAnyResources(a)) {
      merged[existingIdx] = a;
    }
  }
  const savedOrder = loadDisplayOrder();
  const ordered = savedOrder.length > 0 ? applyOrderToItems(merged, savedOrder) : merged;
  const userStreamCount = ordered.filter(declaresStream).length;
  const list = withDebridKeys(ordered, debridKeys, settings.preferredLanguages);
  const existingTorboxIdx = list.findIndex(
    (a) =>
      a.manifest.id === "app.torbox.stremio" ||
      a.transportUrl?.includes("stremio.torbox.app"),
  );
  if (torbox) {
    if (existingTorboxIdx >= 0) {
      const existing = list[existingTorboxIdx];
      if (existing.transportUrl !== torbox.transportUrl) {
        list[existingTorboxIdx] = torbox;
      }
    } else {
      list.push(torbox);
    }
  }
  return { list, userHasStreamAddons: userStreamCount > 0 };
}

function tryBuildWarmAddons(
  authKey: string | null,
  settings: Settings,
): { list: Addon[]; userHasStreamAddons: boolean } | null {
  const stremioRaw = authKey ? peekUserAddons(authKey) : [];
  if (stremioRaw === null) return null;
  const localRaw = loadInstalled();
  if (localRaw.some((entry) => !entry.manifest)) return null;
  const localAddons: Addon[] = localRaw.map((entry) => ({
    manifest: entry.manifest!,
    transportUrl: entry.transportUrl,
  }));
  const stremioAddons = filterEnabled(stremioRaw);
  const installed = filterEnabled(localAddons);
  if ([...stremioAddons, ...installed].some((a) => !hasAnyResources(a))) return null;
  return finalizeAddonList(stremioAddons, installed, settings);
}

export function useAddons(authKey: string | null, settings: Settings): {
  addons: Addon[] | null;
  userHasStreamAddons: boolean;
} {
  const [state, setState] = useState<{ addons: Addon[] | null; userHasStreamAddons: boolean }>(() => {
    const warm = tryBuildWarmAddons(authKey, settings);
    return warm
      ? { addons: warm.list, userHasStreamAddons: warm.userHasStreamAddons }
      : { addons: null, userHasStreamAddons: false };
  });

  useEffect(() => {
    let cancelled = false;
    const warm = tryBuildWarmAddons(authKey, settings);
    if (warm) {
      setState({ addons: warm.list, userHasStreamAddons: warm.userHasStreamAddons });
      return;
    }
    void (async () => {
      const [stremioRaw, installedRaw] = await Promise.all([
        authKey ? userAddonsCached(authKey).catch(() => []) : Promise.resolve([] as Addon[]),
        fetchInstalledAddons().catch(() => [] as Addon[]),
      ]);
      if (cancelled) return;
      const stremioAddons = filterEnabled(stremioRaw);
      const installed = filterEnabled(installedRaw);
      const needsResolve = [...stremioAddons, ...installed].some((a) => !hasAnyResources(a));
      const [resolvedStremio, resolvedInstalled] = needsResolve
        ? await Promise.all([resolveManifests(stremioAddons), resolveManifests(installed)])
        : [stremioAddons, installed];
      if (cancelled) return;
      const built = finalizeAddonList(resolvedStremio, resolvedInstalled, settings);
      console.info(
        `[picker] final addon list (${built.list.length}): ${built.list.map((a) => a.manifest.name).join(", ")}`,
      );
      setState({ addons: built.list, userHasStreamAddons: built.userHasStreamAddons });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    authKey,
    settings,
    settings.rdKey,
    settings.tbKey,
    settings.adKey,
    settings.pmKey,
    settings.dlKey,
    settings.preferredLanguages,
  ]);

  return state;
}
