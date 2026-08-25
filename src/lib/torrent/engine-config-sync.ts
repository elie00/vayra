/**
 * The stream cache directory, retention and size cap live in two places: the
 * settings the panel shows, and `engine.json`, which is what the engine reads at
 * startup — before the frontend exists. They only ever met when someone changed
 * the setting, so a restored backup, a second machine, or a cleared cache folder
 * left the panel showing a cache the engine was not using.
 */
export type EngineCacheOptions = {
  dir: string | null;
  retentionHours: number;
  maxGb: number;
};

export type EngineCacheConfig = {
  dir?: string | null;
  retention_hours?: number | null;
  max_gb?: number | null;
};

/** Nothing to write when the engine already runs on these values. */
export function engineOptionsDiffer(
  want: EngineCacheOptions,
  have: EngineCacheConfig | null,
): boolean {
  if (!have) return true;
  return (
    (have.dir ?? null) !== want.dir ||
    (have.retention_hours ?? null) !== want.retentionHours ||
    (have.max_gb ?? null) !== want.maxGb
  );
}

/**
 * Only a different cache directory needs the engine restarted — the sweeper
 * re-reads retention and the size cap on its own schedule.
 */
export function engineNeedsRestart(
  want: EngineCacheOptions,
  have: EngineCacheConfig | null,
): boolean {
  return (have?.dir ?? null) !== want.dir;
}

/**
 * Hand the engine the cache settings the panel is showing, once at startup.
 * Writes only when they differ, and restarts only when the directory does.
 */
export async function syncEngineCacheOptions(want: EngineCacheOptions): Promise<void> {
  const { readEngineOptions, torrentEngineSetOptions } = await import("./local-engine");
  const have = await readEngineOptions();
  if (!engineOptionsDiffer(want, have)) return;
  await torrentEngineSetOptions(
    want.dir,
    want.retentionHours,
    want.maxGb,
    engineNeedsRestart(want, have),
  );
}
