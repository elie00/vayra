// An addon that declares the `player` or `library` resource hears what the user
// plays and changes in the library, so Stremio asks before installing one. Every
// install path goes through `installFromUrl`, which asks here; the app mounts the
// one dialog that answers.

import type { Addon } from "@/lib/addons";

const WATCH_ACTIVITY_RESOURCES = ["player", "library"];

/** Whether installing this addon hands it the user's watch activity. */
export function receivesWatchActivity(manifest: Pick<Addon["manifest"], "resources">): boolean {
  return (manifest.resources ?? []).some((r) =>
    WATCH_ACTIVITY_RESOURCES.includes(typeof r === "string" ? r : r.name),
  );
}

export type WatchActivityRequest = { name: string; resolve: (allowed: boolean) => void };

let listener: ((request: WatchActivityRequest) => void) | null = null;

/** Resolves false when nothing is mounted to ask the user. */
export function confirmWatchActivityAddon(name: string): Promise<boolean> {
  const ask = listener;
  if (!ask) return Promise.resolve(false);
  return new Promise((resolve) => ask({ name, resolve }));
}

export function onWatchActivityConsent(handler: (request: WatchActivityRequest) => void): () => void {
  listener = handler;
  return () => {
    if (listener === handler) listener = null;
  };
}
