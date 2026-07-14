import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Meta } from "@/lib/cinemeta";
import { LumaStore } from "./store";
import { lumaStorageKey } from "./storage";

const values = new Map<string, string>();

const movie: Meta = {
  id: "tt0133093",
  type: "movie",
  name: "The Matrix",
  poster: "https://images.example/matrix.jpg",
  addonOrigin: { id: "secret-addon", name: "Private addon", base: "https://private.example" },
};

beforeEach(() => {
  vi.useRealTimers();
  values.clear();
  vi.stubGlobal("localStorage", {
    get length() {
      return values.size;
    },
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
  });
});

describe("LUMA local store", () => {
  it("persists only a sanitized media reference and presentation", () => {
    const store = new LumaStore("alice");
    expect(store.add({ meta: movie }).ok).toBe(true);

    const raw = values.get(lumaStorageKey("alice"));
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("secret-addon");
    expect(raw).not.toContain("private.example");
    expect(JSON.parse(raw!).queue[0]).toMatchObject({
      ref: { kind: "catalog", metaId: "tt0133093", mediaType: "movie" },
      presentation: { title: "The Matrix" },
    });
  });

  it("isolates profiles and refuses duplicate or oversized queues", () => {
    const alice = new LumaStore("alice");
    const bob = new LumaStore("bob");
    expect(alice.add({ meta: movie }).ok).toBe(true);
    expect(alice.add({ meta: movie })).toMatchObject({ ok: false, error: { code: "duplicate" } });
    expect(bob.getSnapshot().document.queue).toHaveLength(0);

    for (let i = 0; i < 49; i += 1) {
      alice.add({ meta: { id: `tt${i}`, type: "movie", name: `Movie ${i}` } });
    }
    expect(alice.getSnapshot().document.queue).toHaveLength(50);
    expect(alice.add({ meta: { id: "tt-over", type: "movie", name: "Over" } })).toMatchObject({
      ok: false,
      error: { code: "queue-full" },
    });
  });

  it("keeps an item until playback is acknowledged and blocks shared authorities", () => {
    const store = new LumaStore("alice");
    const added = store.add({ meta: movie });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    expect(store.beginNext("cast")).toMatchObject({ ok: false, error: { code: "authority-blocked" } });
    expect(store.beginNext("solo")).toMatchObject({ ok: true, value: { id: added.value.id } });
    expect(store.getSnapshot().document.queue).toHaveLength(1);

    store.rejectStart("No source");
    expect(store.getSnapshot().document.queue).toHaveLength(1);
    store.beginNext("solo");
    store.acknowledgeStarted(added.value.id);
    expect(store.getSnapshot().document.queue).toHaveLength(0);
  });

  it("migrates the legacy queue without retaining source-bearing metadata", () => {
    values.set("harbor.queue.v1", JSON.stringify([
      {
        id: "legacy-item",
        meta: movie,
        addedAt: 123,
      },
    ]));
    const store = new LumaStore("alice");
    expect(store.getSnapshot().document.queue).toHaveLength(1);
    const raw = values.get(lumaStorageKey("alice"))!;
    expect(raw).not.toContain("secret-addon");
    expect(raw).not.toContain("private.example");
    expect(store.getSnapshot().document.migration.legacyQueueImported).toBe(true);
  });

  it("imports the unscoped legacy queue into only one profile", () => {
    values.set("harbor.queue.v1", JSON.stringify([{ id: "legacy", meta: movie, addedAt: 123 }]));
    const alice = new LumaStore("alice");
    const bob = new LumaStore("bob");
    expect(alice.getSnapshot().document.queue).toHaveLength(1);
    expect(bob.getSnapshot().document.queue).toHaveLength(0);
    expect(values.get("vayra.luma.legacy-owner.v1")).toBe("alice");
  });

  it("recovers the last good document after corruption", () => {
    const first = new LumaStore("alice");
    first.add({ meta: movie });
    first.add({ meta: { id: "tt2", type: "movie", name: "Second" } });
    values.set(lumaStorageKey("alice"), "{corrupt");

    const recovered = new LumaStore("alice");
    expect(recovered.getSnapshot().persistence).toBe("recovered");
    expect(recovered.getSnapshot().document.queue.map((item) => item.presentation.title)).toEqual(["The Matrix"]);
  });

  it("does not overwrite data from a future schema", () => {
    const key = lumaStorageKey("alice");
    const future = JSON.stringify({ schemaVersion: 99, queue: [{ secret: "keep-me" }] });
    values.set(key, future);
    const store = new LumaStore("alice");

    expect(store.getSnapshot().persistence).toBe("future-schema");
    expect(store.add({ meta: movie })).toMatchObject({ ok: false, error: { code: "future-schema" } });
    expect(values.get(key)).toBe(future);
  });

  it("retains only meaningful, unfinished and recent progress", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T10:00:00Z"));
    const store = new LumaStore("alice");

    store.recordProgress({ meta: movie, positionMs: 5_000, durationMs: 360_000 });
    expect(store.getSnapshot().document.resumes).toHaveLength(0);
    store.recordProgress({ meta: movie, positionMs: 120_000, durationMs: 360_000 });
    expect(store.getSnapshot().document.resumes).toHaveLength(1);
    store.recordProgress({ meta: movie, positionMs: 340_000, durationMs: 360_000 });
    expect(store.getSnapshot().document.resumes).toHaveLength(0);
  });

  it("persists the latest progress on a fixed throttle instead of an endless debounce", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const store = new LumaStore("alice");
    store.recordProgress({ meta: movie, positionMs: 60_000, durationMs: 360_000 });
    vi.advanceTimersByTime(2_999);
    store.recordProgress({ meta: movie, positionMs: 90_000, durationMs: 360_000 });
    vi.advanceTimersByTime(1);

    const persisted = JSON.parse(values.get(lumaStorageKey("alice"))!) as { resumes: Array<{ positionMs: number }> };
    expect(persisted.resumes[0]?.positionMs).toBe(90_000);
  });
});
