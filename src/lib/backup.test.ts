import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/theme-storage", () => ({
  loadBgImage: vi.fn(async () => null),
  saveBgImage: vi.fn(async () => undefined),
}));

import { applyBackup, buildBackup, parseBackup, type Backup } from "./backup";

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});

describe("privacy-aware VAYRA backups", () => {
  it("excludes LUMA activity unless the user opts in", async () => {
    values.set("harbor.settings", "{}");
    values.set("vayra.luma.v1.default", "private-activity");

    const safe = await buildBackup();
    expect(safe.data["harbor.settings"]).toBe("{}");
    expect(safe.data["vayra.luma.v1.default"]).toBeUndefined();
    expect(safe.includesLocalActivity).toBe(false);

    const complete = await buildBackup({ includeLocalActivity: true });
    expect(complete.data["vayra.luma.v1.default"]).toBe("private-activity");
    expect(complete.includesLocalActivity).toBe(true);
  });

  it("preserves current LUMA activity when restoring a backup that excludes it", async () => {
    values.set("harbor.settings", "old");
    values.set("vayra.luma.v1.default", "keep-local");
    const backup: Backup = {
      format: "vayra-backup",
      version: 1,
      app: "test",
      exportedAt: new Date().toISOString(),
      data: { "harbor.settings": "new" },
      includesLocalActivity: false,
    };

    await applyBackup(backup);
    expect(values.get("harbor.settings")).toBe("new");
    expect(values.get("vayra.luma.v1.default")).toBe("keep-local");
  });

  it("restores and labels opted-in LUMA activity", async () => {
    const text = JSON.stringify({
      format: "vayra-backup",
      version: 1,
      app: "test",
      exportedAt: "",
      data: { "harbor.settings": "{}", "vayra.luma.v1.default": "restored" },
    });
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.includesLocalActivity).toBe(true);
    await applyBackup(parsed.backup);
    expect(values.get("vayra.luma.v1.default")).toBe("restored");
  });
});

