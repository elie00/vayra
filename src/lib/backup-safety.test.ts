import { beforeEach, describe, expect, it, vi } from "vitest";

const theme = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/theme-storage", () => ({ loadBgImage: theme.load, saveBgImage: theme.save }));
import { applyBackup, BackupRestoreError, buildBackup, parseBackup, type Backup } from "./backup";

const values = new Map<string, string>();
const storage = {
  get length() { return values.size; },
  key: (index: number) => [...values.keys()][index] ?? null,
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};
const json = JSON.stringify;
const fixture = (data: Record<string, string>, options: Partial<Backup> = {}): Backup => ({
  format: "vayra-backup", version: 2, app: "test", exportedAt: "2026-09-06T10:00:00Z", data, ...options,
});
const luma = () => ({
  schemaVersion: 1, revision: 1, updatedAt: 1, profileId: "default",
  queue: [{ id: "queue-1", ref: { kind: "catalog", metaId: "tt123", mediaType: "movie" }, presentation: { title: "Fixture film" }, addedAt: 1 }],
  resumes: [], preferences: { autoAdvance: true, rememberActivity: true }, migration: { legacyQueueImported: true, legacyResumeImported: true, completedAt: 1 },
});

beforeEach(() => {
  vi.restoreAllMocks(); values.clear(); vi.stubGlobal("localStorage", storage);
  theme.load.mockReset().mockResolvedValue(null); theme.save.mockReset().mockResolvedValue(true);
});

describe("portable backup privacy", () => {
  it("excludes sessions and unknown stores even with private activity enabled", async () => {
    values.set("harbor.settings", json({ uiLanguage: "fr" }));
    for (const key of ["harbor.auth", "harbor.auth.profile", "harbor.trakt.session.v1.profile", "harbor.simkl.session.v1.profile", "harbor.anilist.session.v1.profile", "harbor.mal.session.v1.profile", "harbor.letterboxd.session.v1", "harbor.tvdb.token.v1", "harbor.future-service", "harbor.addonOrderBackups", "harbor.installed-addons", "harbor.profiles.v1"]) values.set(key, json({ accessToken: "FIXTURE_SECRET" }));
    const result = await buildBackup({ includeLocalActivity: true });
    expect(Object.keys(result.data)).toEqual(["harbor.settings"]);
    expect(json(result)).not.toContain("FIXTURE_SECRET");
  });
  it("allowlists nested preferences and excludes opaque configurations, custom code and URLs", async () => {
    values.set("harbor.settings", json({
      uiLanguage: "fr", rdKey: "FIXTURE_SECRET", traktAccessToken: "FIXTURE_SECRET", mpvExtraOptions: "FIXTURE_SECRET", customJs: "FIXTURE_SECRET",
      remoteStreamServerUrl: "https://server.invalid/FIXTURE_SECRET", letterboxd: { encodedConfig: "FIXTURE_SECRET" },
      theme: { preset: "sage", backgroundImage: "https://image.invalid/FIXTURE_SECRET", secret: "FIXTURE_SECRET" },
      homeRows: { order: ["movies"], customSources: [{ transportUrl: "https://addon.invalid/FIXTURE_SECRET/manifest.json" }], auth: "FIXTURE_SECRET" },
      preferredSubLangs: ["French", "https://service.invalid/FIXTURE_SECRET"], webhooks: { token: "FIXTURE_SECRET" },
    }));
    expect(JSON.parse((await buildBackup()).data["harbor.settings"])).toEqual({ uiLanguage: "fr", theme: { preset: "sage" }, homeRows: { order: ["movies"] }, preferredSubLangs: ["French"] });
    expect(json(await buildBackup())).not.toContain("FIXTURE_SECRET");
  });
  it("keeps supported private library, list and progress metadata only on opt-in", async () => {
    values.set("harbor.settings", "{}");
    values.set("vayra.luma.v1.default", json(luma()));
    values.set("harbor.watchlist.v1", json([{ id: "tt123", type: "movie", name: "Fixture film", addedAt: 1, poster: "https://image.invalid/FIXTURE_SECRET", accessToken: "FIXTURE_SECRET" }]));
    values.set("harbor.library.local.v1", json([{ id: "local-1", path: "/Fixtures/film.mkv", filename: "film.mkv", title: "Fixture film", year: 2026, type: "movie", addedAt: 1, streamUrl: "https://server.invalid/FIXTURE_SECRET" }]));
    values.set("harbor.resume", json({ tt123: { ms: 1234, t: 1, token: "FIXTURE_SECRET" } }));
    expect(Object.keys((await buildBackup()).data)).toEqual(["harbor.settings"]);
    const complete = await buildBackup({ includeLocalActivity: true });
    expect(JSON.parse(complete.data["vayra.luma.v1.default"])).toEqual(luma());
    expect(JSON.parse(complete.data["harbor.watchlist.v1"])[0].name).toBe("Fixture film");
    expect(JSON.parse(complete.data["harbor.library.local.v1"])[0].path).toBe("/Fixtures/film.mkv");
    expect(JSON.parse(complete.data["harbor.resume"])).toEqual({ tt123: { ms: 1234, t: 1 } });
    expect(json(complete)).not.toContain("FIXTURE_SECRET");
  });
  it("strips nested LUMA URLs and secret fields without discarding queue or progress", async () => {
    const document = { ...luma(), token: "FIXTURE_SECRET", resumes: [{ ...luma().queue[0], positionMs: 500000, durationMs: 6000000, updatedAt: 1 }] };
    Object.assign(document.queue[0].ref, { stream: "https://host.invalid/FIXTURE_SECRET" });
    Object.assign(document.queue[0].presentation, { artwork: "https://host.invalid/FIXTURE_SECRET" });
    values.set("vayra.luma.v1.default", json(document));
    const result = JSON.parse((await buildBackup({ includeLocalActivity: true })).data["vayra.luma.v1.default"]);
    expect(result.queue).toHaveLength(1); expect(result.resumes[0].positionMs).toBe(500000); expect(json(result)).not.toContain("FIXTURE_SECRET");
  });
  it("exports raster backgrounds but not authenticated links", async () => {
    values.set("harbor.settings", "{}");
    theme.load.mockResolvedValueOnce("https://host.invalid/FIXTURE_SECRET");
    expect((await buildBackup()).bgImage).toBeUndefined();
    theme.load.mockResolvedValueOnce("data:image/png;base64,AAAA");
    expect((await buildBackup()).bgImage).toBe("data:image/png;base64,AAAA");
  });
  it("sanitizes old imports and preserves current sessions and nested excluded settings", async () => {
    for (const key of ["harbor.auth", "harbor.trakt.session.v1.default", "harbor.installed-addons", "harbor.profiles.v1"]) values.set(key, "CURRENT_SECRET");
    values.set("harbor.settings", json({ uiLanguage: "en", rdKey: "CURRENT_KEY", theme: { preset: "old", backgroundImage: "CURRENT_BACKGROUND" }, homeRows: { customSources: ["CURRENT_SOURCE"], order: ["old"] } }));
    const parsed = parseBackup(json(fixture({
      "harbor.auth": "OLD_SESSION", "harbor.trakt.session.v1.default": "OLD_TRAKT", "harbor.installed-addons": "OLD_EXTENSIONS", "harbor.profiles.v1": "OLD_PROFILES",
      "harbor.settings": json({ uiLanguage: "fr", rdKey: "OLD_KEY", theme: { preset: "sage", backgroundImage: "https://old.invalid/token" }, homeRows: { customSources: ["OLD_SOURCE"], order: ["movies"] } }),
    }, { version: 1 })));
    expect(parsed.ok).toBe(true); if (!parsed.ok) return;
    await applyBackup(parsed.backup);
    for (const key of ["harbor.auth", "harbor.trakt.session.v1.default", "harbor.installed-addons", "harbor.profiles.v1"]) expect(values.get(key)).toBe("CURRENT_SECRET");
    expect(JSON.parse(values.get("harbor.settings")!)).toEqual({ uiLanguage: "fr", rdKey: "CURRENT_KEY", theme: { preset: "sage", backgroundImage: "CURRENT_BACKGROUND" }, homeRows: { customSources: ["CURRENT_SOURCE"], order: ["movies"] } });
  });
  it("rejects future formats, malformed preferences and credentials-only backups", () => {
    expect(parseBackup(json(fixture({ "harbor.settings": "{}" }, { version: 999 }))).ok).toBe(false);
    expect(parseBackup(json(fixture({ "harbor.settings": "not-json" }))).ok).toBe(false);
    expect(parseBackup(json(fixture({ "harbor.auth": "old" }))).ok).toBe(false);
  });
});

describe("recoverable restore", () => {
  it("recovers prior values when a later write is rejected", async () => {
    values.set("harbor.settings", json({ uiLanguage: "en", rdKey: "CURRENT_KEY" })); const before = new Map(values);
    vi.spyOn(storage, "setItem").mockImplementation((key, value) => { if (key === "harbor.settings.shared") throw new Error("Fixture quota"); values.set(key, value); });
    await expect(applyBackup(fixture({ "harbor.settings": json({ uiLanguage: "fr" }), "harbor.settings.shared": "{}" }))).rejects.toThrow("previous preferences were recovered");
    expect(values).toEqual(before);
  });
  it("removes new entries on rollback and preserves unrelated stores", async () => {
    values.set("harbor.auth", "CURRENT_SESSION"); const before = new Map(values);
    vi.spyOn(storage, "setItem").mockImplementation((key, value) => { if (key === "harbor.settings.shared") throw new Error("Fixture quota"); values.set(key, value); });
    await expect(applyBackup(fixture({ "harbor.settings": json({ uiLanguage: "fr" }), "harbor.settings.shared": "{}" }))).rejects.toThrow(BackupRestoreError);
    expect(values).toEqual(before);
  });
  it("shrinks changed entries first so rollback fits the original storage quota", async () => {
    const small = json({ uiLanguage: "fr" }); const large = json({ uiLanguage: "x".repeat(500) });
    values.set("harbor.settings", large); values.set("harbor.settings.shared", small);
    const before = new Map(values); const capacity = small.length + large.length;
    vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      const size = [...values.values()].reduce((sum, entry) => sum + entry.length, 0) - (values.get(key)?.length ?? 0) + value.length;
      if (size > capacity) throw new Error("Fixture quota"); values.set(key, value);
    });
    await expect(applyBackup(fixture({ "harbor.settings": small, "harbor.settings.shared": large, "harbor.settings.extra": "{}" }))).rejects.toThrow("previous preferences were recovered");
    expect(values).toEqual(before);
  });
  it("handles a false background persistence result and recovers both stores", async () => {
    values.set("harbor.settings", json({ uiLanguage: "en" }));
    theme.load.mockResolvedValue("data:image/png;base64,AAAA"); theme.save.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(applyBackup(fixture({ "harbor.settings": json({ uiLanguage: "fr" }) }, { bgImage: "data:image/png;base64,BBBB" }))).rejects.toThrow("previous preferences were recovered");
    expect(values.get("harbor.settings")).toBe(json({ uiLanguage: "en" })); expect(theme.save).toHaveBeenLastCalledWith("data:image/png;base64,AAAA");
  });
  it("retains a retry action when rollback fails and recovers once storage is writable", async () => {
    const previous = json({ uiLanguage: "en" }); values.set("harbor.settings", previous);
    const writer = vi.spyOn(storage, "setItem").mockImplementation((key, value) => { if (key === "harbor.settings.shared" || value === previous) throw new Error("Fixture unavailable storage"); values.set(key, value); });
    let failure: BackupRestoreError | undefined;
    try { await applyBackup(fixture({ "harbor.settings": json({ uiLanguage: "fr" }), "harbor.settings.shared": "{}" })); } catch (error) { failure = error as BackupRestoreError; }
    expect(failure?.retryRecovery).toBeTypeOf("function");
    writer.mockImplementation((key, value) => { values.set(key, value); });
    await failure!.retryRecovery!(); expect(values.get("harbor.settings")).toBe(previous);
  });
  it("changes nothing when current preferences cannot be safely merged", async () => {
    values.set("harbor.settings", "unreadable-current-data"); const before = new Map(values);
    await expect(applyBackup(fixture({ "harbor.settings": json({ uiLanguage: "fr" }) }))).rejects.toThrow("Nothing was restored"); expect(values).toEqual(before);
  });
});
