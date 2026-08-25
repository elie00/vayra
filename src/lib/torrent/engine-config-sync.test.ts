import { describe, expect, it } from "vitest";
import {
  engineNeedsRestart,
  engineOptionsDiffer,
  type EngineCacheOptions,
} from "./engine-config-sync";

const want: EngineCacheOptions = { dir: "/media/cache", retentionHours: 24, maxGb: 20 };

describe("engineOptionsDiffer", () => {
  it("says nothing to do when the engine already runs on these values", () => {
    expect(
      engineOptionsDiffer(want, { dir: "/media/cache", retention_hours: 24, max_gb: 20 }),
    ).toBe(false);
  });

  it("spots a config the engine has never been given", () => {
    // What a restored backup looks like: settings say one thing, engine.json is absent.
    expect(engineOptionsDiffer(want, null)).toBe(true);
  });

  it("spots each field on its own", () => {
    expect(engineOptionsDiffer(want, { dir: "/other", retention_hours: 24, max_gb: 20 })).toBe(true);
    expect(engineOptionsDiffer(want, { dir: "/media/cache", retention_hours: 48, max_gb: 20 })).toBe(true);
    expect(engineOptionsDiffer(want, { dir: "/media/cache", retention_hours: 24, max_gb: 50 })).toBe(true);
  });

  it("treats a missing field as unset rather than as a match", () => {
    expect(engineOptionsDiffer({ ...want, dir: null }, {})).toBe(true);
    expect(engineOptionsDiffer({ ...want, dir: null }, { retention_hours: 24, max_gb: 20 })).toBe(false);
  });
});

describe("engineNeedsRestart", () => {
  it("restarts only for a different cache directory", () => {
    expect(engineNeedsRestart(want, { dir: "/other", retention_hours: 24, max_gb: 20 })).toBe(true);
    expect(engineNeedsRestart(want, { dir: "/media/cache", retention_hours: 999, max_gb: 1 })).toBe(false);
  });

  it("does not restart when the default directory is already in use", () => {
    expect(engineNeedsRestart({ ...want, dir: null }, { retention_hours: 1, max_gb: 1 })).toBe(false);
  });
});
