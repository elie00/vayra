import { activeProfileId } from "@/lib/active-profile-id";
import type { Meta } from "@/lib/cinemeta";
import type { PlayEpisode } from "@/lib/view";
import {
  LUMA_FINISHED_RATIO,
  LUMA_QUEUE_LIMIT,
  LUMA_RESUME_LIMIT,
  LUMA_RESUME_RETENTION_MS,
  lumaRefKey,
  type LumaAuthority,
  type LumaDocumentV1,
  type LumaError,
  type LumaMediaInput,
  type LumaProgressInput,
  type LumaQueueItem,
  type LumaResult,
  type LumaSnapshot,
} from "./types";
import { loadLumaDocument, lumaInput, lumaStorageKey, parseLumaStorageEvent, saveLumaDocument } from "./storage";

type Listener = () => void;

function rid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function error(code: LumaError["code"], message: string): LumaResult<never> {
  return { ok: false, error: { code, message } };
}

export class LumaStore {
  readonly profileId: string;
  private snapshot: LumaSnapshot;
  private readonly listeners = new Set<Listener>();
  private progressTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(profileId: string) {
    this.profileId = profileId || "default";
    const loaded = loadLumaDocument(this.profileId);
    this.snapshot = {
      document: loaded.document,
      persistence: loaded.persistence,
      pendingItemId: null,
      lastError: loaded.persistence === "future-schema"
        ? { code: "future-schema", message: "Ces données LUMA proviennent d’une version plus récente de VAYRA." }
        : null,
    };
    if (loaded.document.migration.completedAt > 0 && loaded.document.revision === 0) this.commit(loaded.document, false);
  }

  getSnapshot = (): LumaSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private blocked(): LumaResult<never> | null {
    if (this.snapshot.persistence !== "future-schema") return null;
    return error("future-schema", "Mettez VAYRA à jour avant de modifier ces données LUMA.");
  }

  private commit(document: LumaDocumentV1, notify = true): void {
    const next: LumaDocumentV1 = {
      ...document,
      revision: document.revision + 1,
      updatedAt: Date.now(),
    };
    const saved = saveLumaDocument(next);
    this.snapshot = {
      ...this.snapshot,
      document: next,
      persistence: saved ? (this.snapshot.persistence === "recovered" ? "recovered" : "ready") : "volatile",
      lastError: saved ? null : { code: "storage-unavailable", message: "LUMA fonctionne en mémoire, mais la persistance locale est indisponible." },
    };
    if (notify) this.emit();
  }

  replaceFromStorage(document: LumaDocumentV1): void {
    if (document.revision <= this.snapshot.document.revision) return;
    this.snapshot = { ...this.snapshot, document, persistence: "ready", lastError: null };
    this.emit();
  }

  add(input: LumaMediaInput): LumaResult<LumaQueueItem> {
    const blocked = this.blocked();
    if (blocked) return blocked;
    const mapped = lumaInput(input.meta, input.episode);
    if (!mapped) return error("invalid-media", "Ce média ne peut pas être conservé dans LUMA sans exposer une source locale.");
    const document = this.snapshot.document;
    const key = lumaRefKey(mapped.ref);
    const duplicate = document.queue.find((item) => lumaRefKey(item.ref) === key);
    if (duplicate) return error("duplicate", "Ce média est déjà dans la file LUMA.");
    if (document.queue.length >= LUMA_QUEUE_LIMIT) return error("queue-full", `La file LUMA est limitée à ${LUMA_QUEUE_LIMIT} éléments.`);
    const item: LumaQueueItem = { id: rid(), ...mapped, addedAt: Date.now() };
    this.commit({ ...document, queue: [...document.queue, item] });
    return { ok: true, value: item };
  }

  toggle(input: LumaMediaInput): LumaResult<LumaQueueItem | null> {
    const mapped = lumaInput(input.meta, input.episode);
    if (!mapped) return error("invalid-media", "Ce média ne peut pas être conservé dans LUMA sans exposer une source locale.");
    const existing = this.snapshot.document.queue.find((item) => lumaRefKey(item.ref) === lumaRefKey(mapped.ref));
    if (existing) {
      this.remove(existing.id);
      return { ok: true, value: null };
    }
    return this.add(input);
  }

  remove(id: string): LumaResult<undefined> {
    const blocked = this.blocked();
    if (blocked) return blocked;
    const document = this.snapshot.document;
    const queue = document.queue.filter((item) => item.id !== id);
    if (queue.length === document.queue.length) return { ok: true, value: undefined };
    this.commit({ ...document, queue });
    if (this.snapshot.pendingItemId === id) this.rejectStart();
    return { ok: true, value: undefined };
  }

  clearQueue(): LumaResult<undefined> {
    const blocked = this.blocked();
    if (blocked) return blocked;
    if (this.snapshot.document.queue.length === 0) return { ok: true, value: undefined };
    this.commit({ ...this.snapshot.document, queue: [] });
    this.snapshot = { ...this.snapshot, pendingItemId: null };
    return { ok: true, value: undefined };
  }

  move(id: string, toIndex: number): LumaResult<undefined> {
    const blocked = this.blocked();
    if (blocked) return blocked;
    const document = this.snapshot.document;
    const from = document.queue.findIndex((item) => item.id === id);
    if (from < 0) return { ok: true, value: undefined };
    const bounded = Math.max(0, Math.min(document.queue.length - 1, Math.floor(toIndex)));
    if (from === bounded) return { ok: true, value: undefined };
    const queue = [...document.queue];
    const [item] = queue.splice(from, 1);
    queue.splice(bounded, 0, item);
    this.commit({ ...document, queue });
    return { ok: true, value: undefined };
  }

  reorder(orderedIds: string[]): LumaResult<undefined> {
    const known = new Map(this.snapshot.document.queue.map((item) => [item.id, item]));
    const queue = orderedIds.flatMap((id) => {
      const item = known.get(id);
      if (!item) return [];
      known.delete(id);
      return [item];
    });
    queue.push(...known.values());
    this.commit({ ...this.snapshot.document, queue });
    return { ok: true, value: undefined };
  }

  beginNext(authority: LumaAuthority): LumaResult<LumaQueueItem> {
    if (authority !== "solo") return error("authority-blocked", "La lecture LUMA est disponible après avoir quitté la session partagée ou le cast.");
    const first = this.snapshot.document.queue[0];
    if (!first) return error("queue-empty", "La file LUMA est vide.");
    this.snapshot = { ...this.snapshot, pendingItemId: first.id, lastError: null };
    this.emit();
    return { ok: true, value: first };
  }

  acknowledgeStarted(id: string): LumaResult<undefined> {
    if (this.snapshot.pendingItemId !== id) return { ok: true, value: undefined };
    const document = this.snapshot.document;
    this.snapshot = { ...this.snapshot, pendingItemId: null };
    this.commit({ ...document, queue: document.queue.filter((item) => item.id !== id) });
    return { ok: true, value: undefined };
  }

  rejectStart(message?: string): void {
    this.snapshot = {
      ...this.snapshot,
      pendingItemId: null,
      lastError: message ? { code: "invalid-media", message } : this.snapshot.lastError,
    };
    this.emit();
  }

  setAutoAdvance(enabled: boolean): LumaResult<undefined> {
    const blocked = this.blocked();
    if (blocked) return blocked;
    this.commit({
      ...this.snapshot.document,
      preferences: { ...this.snapshot.document.preferences, autoAdvance: enabled },
    });
    return { ok: true, value: undefined };
  }

  setRememberActivity(enabled: boolean): LumaResult<undefined> {
    const blocked = this.blocked();
    if (blocked) return blocked;
    const document = this.snapshot.document;
    this.commit({
      ...document,
      resumes: enabled ? document.resumes : [],
      preferences: { ...document.preferences, rememberActivity: enabled },
    });
    return { ok: true, value: undefined };
  }

  recordProgress(input: LumaProgressInput): LumaResult<undefined> {
    const blocked = this.blocked();
    if (blocked) return blocked;
    const document = this.snapshot.document;
    if (!document.preferences.rememberActivity) return { ok: true, value: undefined };
    const mapped = lumaInput(input.meta, input.episode);
    if (!mapped) return error("invalid-media", "Cette source n’est pas éligible à la reprise LUMA.");
    const now = input.updatedAt ?? Date.now();
    const key = lumaRefKey(mapped.ref);
    const positionMs = Math.max(0, input.positionMs);
    const durationMs = Math.max(0, input.durationMs);
    let resumes = document.resumes.filter((entry) => lumaRefKey(entry.ref) !== key && now - entry.updatedAt <= LUMA_RESUME_RETENTION_MS);
    if (durationMs >= 150_000 && positionMs / durationMs < LUMA_FINISHED_RATIO && positionMs >= 10_000) {
      resumes.unshift({ id: rid(), ...mapped, positionMs, durationMs, updatedAt: now });
    }
    resumes = resumes.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, LUMA_RESUME_LIMIT);
    const next: LumaDocumentV1 = { ...document, resumes, revision: document.revision + 1, updatedAt: now };
    this.snapshot = { ...this.snapshot, document: next };
    this.emit();
    if (this.progressTimer) clearTimeout(this.progressTimer);
    this.progressTimer = setTimeout(() => {
      this.progressTimer = null;
      const saved = saveLumaDocument(this.snapshot.document);
      if (!saved) {
        this.snapshot = {
          ...this.snapshot,
          persistence: "volatile",
          lastError: { code: "storage-unavailable", message: "La progression LUMA n’a pas pu être persistée localement." },
        };
        this.emit();
      }
    }, 4_000);
    return { ok: true, value: undefined };
  }

  clearResume(id: string): LumaResult<undefined> {
    const blocked = this.blocked();
    if (blocked) return blocked;
    const document = this.snapshot.document;
    this.commit({ ...document, resumes: document.resumes.filter((entry) => entry.id !== id) });
    return { ok: true, value: undefined };
  }

  dispose(): void {
    if (this.progressTimer) clearTimeout(this.progressTimer);
    this.listeners.clear();
  }
}

const stores = new Map<string, LumaStore>();

export function lumaStore(profileId = activeProfileId()): LumaStore {
  const id = profileId || "default";
  let store = stores.get(id);
  if (!store) {
    store = new LumaStore(id);
    stores.set(id, store);
  }
  return store;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    for (const store of stores.values()) {
      if (event.key !== lumaStorageKey(store.profileId)) continue;
      const document = parseLumaStorageEvent(event.newValue, store.profileId);
      if (document) store.replaceFromStorage(document);
    }
  });
}

export function lumaQueueKey(meta: Meta, episode?: PlayEpisode): string | null {
  const mapped = lumaInput(meta, episode);
  return mapped ? lumaRefKey(mapped.ref) : null;
}

