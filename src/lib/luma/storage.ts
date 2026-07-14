import type { Meta } from "@/lib/cinemeta";
import { setItemWithRecovery } from "@/lib/storage-recovery";
import type { PlayEpisode } from "@/lib/view";
import {
  LUMA_FINISHED_RATIO,
  LUMA_QUEUE_LIMIT,
  LUMA_RESUME_LIMIT,
  LUMA_RESUME_RETENTION_MS,
  LUMA_SCHEMA_VERSION,
  lumaRefKey,
  type LumaDocumentV1,
  type LumaMediaRef,
  type LumaPersistenceState,
  type LumaPresentation,
  type LumaQueueItem,
  type LumaResumeEntry,
} from "./types";

const LEGACY_QUEUE_KEY = "harbor.queue.v1";
const LEGACY_RESUME_KEY = "harbor.localcw.v1";
const LOCAL_LIBRARY_KEY = "harbor.library.local.v1";
const LEGACY_MIGRATION_OWNER_KEY = "vayra.luma.legacy-owner.v1";

export function lumaStorageKey(profileId: string): string {
  return `vayra.luma.v1.${encodeURIComponent(profileId || "default")}`;
}

export function lumaBackupKey(profileId: string): string {
  return `${lumaStorageKey(profileId)}.last-good`;
}

export function emptyLumaDocument(profileId: string, now = Date.now()): LumaDocumentV1 {
  return {
    schemaVersion: LUMA_SCHEMA_VERSION,
    revision: 0,
    updatedAt: now,
    profileId: profileId || "default",
    queue: [],
    resumes: [],
    preferences: { autoAdvance: true, rememberActivity: true },
    migration: {
      legacyQueueImported: false,
      legacyResumeImported: false,
      completedAt: 0,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().slice(0, max);
  return clean || undefined;
}

function safeArtwork(value: unknown): string | undefined {
  const artwork = cleanText(value, 2_048);
  if (!artwork) return undefined;
  if (/^https?:/i.test(artwork)) return artwork;
  return undefined;
}

function sanitizeEpisode(value: unknown): LumaMediaRef["episode"] {
  if (!isRecord(value)) return undefined;
  const season = finite(value.season);
  const episode = finite(value.episode);
  if (season == null || episode == null || season < 0 || episode < 0) return undefined;
  return {
    season: Math.floor(season),
    episode: Math.floor(episode),
    ...(cleanText(value.canonicalVideoId, 256) ? { canonicalVideoId: cleanText(value.canonicalVideoId, 256) } : {}),
  };
}

function sanitizeRef(value: unknown): LumaMediaRef | null {
  if (!isRecord(value)) return null;
  const mediaType = value.mediaType === "series" ? "series" : value.mediaType === "movie" ? "movie" : null;
  if (!mediaType) return null;
  const episode = sanitizeEpisode(value.episode);
  if (value.kind === "catalog") {
    const metaId = cleanText(value.metaId, 512);
    if (!metaId || metaId.startsWith("local:")) return null;
    return { kind: "catalog", metaId, mediaType, ...(episode ? { episode } : {}) };
  }
  if (value.kind === "local-library") {
    const entryId = cleanText(value.entryId, 256);
    if (!entryId || entryId.includes("/") || entryId.includes("\\")) return null;
    return { kind: "local-library", entryId, mediaType, ...(episode ? { episode } : {}) };
  }
  return null;
}

function sanitizePresentation(value: unknown): LumaPresentation | null {
  if (!isRecord(value)) return null;
  const title = cleanText(value.title, 300);
  if (!title) return null;
  const episodeTitle = cleanText(value.episodeTitle, 300);
  const artwork = safeArtwork(value.artwork);
  return { title, ...(episodeTitle ? { episodeTitle } : {}), ...(artwork ? { artwork } : {}) };
}

function sanitizeQueueItem(value: unknown): LumaQueueItem | null {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id, 128);
  const ref = sanitizeRef(value.ref);
  const presentation = sanitizePresentation(value.presentation);
  const addedAt = finite(value.addedAt);
  if (!id || !ref || !presentation || addedAt == null) return null;
  return { id, ref, presentation, addedAt };
}

function sanitizeResume(value: unknown, now: number): LumaResumeEntry | null {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id, 128);
  const ref = sanitizeRef(value.ref);
  const presentation = sanitizePresentation(value.presentation);
  const positionMs = finite(value.positionMs);
  const durationMs = finite(value.durationMs);
  const updatedAt = finite(value.updatedAt);
  if (!id || !ref || !presentation || positionMs == null || durationMs == null || updatedAt == null) return null;
  if (positionMs < 0 || durationMs < 150_000 || positionMs / durationMs >= LUMA_FINISHED_RATIO) return null;
  if (now - updatedAt > LUMA_RESUME_RETENTION_MS) return null;
  return { id, ref, presentation, positionMs, durationMs, updatedAt };
}

type ParsedDocument =
  | { kind: "valid"; document: LumaDocumentV1 }
  | { kind: "future" }
  | { kind: "invalid" };

function parseDocument(raw: string, profileId: string, now: number): ParsedDocument {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: "invalid" };
  }
  if (!isRecord(value)) return { kind: "invalid" };
  const schemaVersion = finite(value.schemaVersion);
  if (schemaVersion != null && schemaVersion > LUMA_SCHEMA_VERSION) return { kind: "future" };
  if (schemaVersion !== LUMA_SCHEMA_VERSION) return { kind: "invalid" };
  const rawQueue = Array.isArray(value.queue) ? value.queue : [];
  const rawResumes = Array.isArray(value.resumes) ? value.resumes : [];
  const queue: LumaQueueItem[] = [];
  const queueKeys = new Set<string>();
  for (const candidate of rawQueue) {
    const item = sanitizeQueueItem(candidate);
    if (!item) continue;
    const key = lumaRefKey(item.ref);
    if (queueKeys.has(key)) continue;
    queueKeys.add(key);
    queue.push(item);
    if (queue.length >= LUMA_QUEUE_LIMIT) break;
  }
  const resumes = rawResumes
    .map((entry) => sanitizeResume(entry, now))
    .filter((entry): entry is LumaResumeEntry => Boolean(entry))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, LUMA_RESUME_LIMIT);
  const revision = finite(value.revision) ?? 0;
  const updatedAt = finite(value.updatedAt) ?? now;
  const preferences = isRecord(value.preferences) ? value.preferences : {};
  const migration = isRecord(value.migration) ? value.migration : {};
  return {
    kind: "valid",
    document: {
      schemaVersion: LUMA_SCHEMA_VERSION,
      revision: Math.max(0, Math.floor(revision)),
      updatedAt,
      profileId,
      queue,
      resumes,
      preferences: {
        autoAdvance: preferences.autoAdvance !== false,
        rememberActivity: preferences.rememberActivity !== false,
      },
      migration: {
        legacyQueueImported: migration.legacyQueueImported === true,
        legacyResumeImported: migration.legacyResumeImported === true,
        completedAt: finite(migration.completedAt) ?? 0,
      },
    },
  };
}

function rid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function localLibraryIds(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_LIBRARY_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.flatMap((item) => (isRecord(item) && typeof item.id === "string" ? [item.id] : [])));
  } catch {
    return new Set();
  }
}

export function lumaInput(meta: Meta, episode?: PlayEpisode): { ref: LumaMediaRef; presentation: LumaPresentation } | null {
  const metaId = cleanText(meta.id, 512);
  const title = cleanText(meta.name, 300);
  if (!metaId || !title) return null;
  const mediaType = meta.type === "series" || meta.type === "anime" ? "series" : "movie";
  const episodeRef = episode
    ? {
        season: Math.max(0, Math.floor(episode.season)),
        episode: Math.max(0, Math.floor(episode.episode)),
        ...(cleanText(episode.videoId || episode.imdbId, 256)
          ? { canonicalVideoId: cleanText(episode.videoId || episode.imdbId, 256) }
          : {}),
      }
    : undefined;
  let ref: LumaMediaRef;
  if (metaId.startsWith("local:")) {
    const entryId = metaId.slice("local:".length);
    if (!entryId || !localLibraryIds().has(entryId)) return null;
    ref = { kind: "local-library", entryId, mediaType, ...(episodeRef ? { episode: episodeRef } : {}) };
  } else {
    ref = { kind: "catalog", metaId, mediaType, ...(episodeRef ? { episode: episodeRef } : {}) };
  }
  const episodeTitle = cleanText(episode?.name, 300);
  const artwork = safeArtwork(episode?.still || meta.poster || meta.background);
  return {
    ref,
    presentation: { title, ...(episodeTitle ? { episodeTitle } : {}), ...(artwork ? { artwork } : {}) },
  };
}

function migrateLegacyQueue(): LumaQueueItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_QUEUE_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: LumaQueueItem[] = [];
    const keys = new Set<string>();
    for (const value of parsed) {
      if (!isRecord(value) || !isRecord(value.meta)) continue;
      const input = lumaInput(value.meta as Meta, isRecord(value.episode) ? (value.episode as PlayEpisode) : undefined);
      if (!input) continue;
      const key = lumaRefKey(input.ref);
      if (keys.has(key)) continue;
      keys.add(key);
      out.push({
        id: cleanText(value.id, 128) || rid(),
        ...input,
        addedAt: finite(value.addedAt) ?? Date.now(),
      });
      if (out.length >= LUMA_QUEUE_LIMIT) break;
    }
    return out;
  } catch {
    return [];
  }
}

function migrateLegacyResume(now: number): LumaResumeEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_RESUME_KEY) || "{}") as unknown;
    if (!isRecord(parsed)) return [];
    const out: LumaResumeEntry[] = [];
    for (const value of Object.values(parsed)) {
      if (!isRecord(value)) continue;
      const id = cleanText(value.id, 512);
      const name = cleanText(value.name, 300);
      if (!id || !name) continue;
      const episode = finite(value.season) != null && finite(value.episode) != null
        ? { season: finite(value.season)!, episode: finite(value.episode)!, name: undefined, videoId: cleanText(value.videoId, 256) }
        : undefined;
      const input = lumaInput(
        { id, name, type: value.type === "series" ? "series" : "movie", poster: safeArtwork(value.poster), background: safeArtwork(value.background) },
        episode,
      );
      if (!input) continue;
      const candidate = sanitizeResume(
        {
          id: rid(),
          ...input,
          positionMs: finite(value.positionMs),
          durationMs: finite(value.durationMs),
          updatedAt: finite(value.t),
        },
        now,
      );
      if (candidate) out.push(candidate);
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, LUMA_RESUME_LIMIT);
  } catch {
    return [];
  }
}

function claimLegacyMigration(profileId: string): boolean {
  try {
    const hasLegacy = localStorage.getItem(LEGACY_QUEUE_KEY) != null || localStorage.getItem(LEGACY_RESUME_KEY) != null;
    if (!hasLegacy) return false;
    const owner = localStorage.getItem(LEGACY_MIGRATION_OWNER_KEY);
    if (owner) return owner === profileId;
    localStorage.setItem(LEGACY_MIGRATION_OWNER_KEY, profileId);
    return true;
  } catch {
    return false;
  }
}

export type LumaLoadResult = {
  document: LumaDocumentV1;
  persistence: LumaPersistenceState;
};

export function loadLumaDocument(profileId: string, now = Date.now()): LumaLoadResult {
  const key = lumaStorageKey(profileId);
  const backupKey = lumaBackupKey(profileId);
  let mainRaw: string | null = null;
  let backupRaw: string | null = null;
  try {
    mainRaw = localStorage.getItem(key);
    backupRaw = localStorage.getItem(backupKey);
  } catch {
    return { document: emptyLumaDocument(profileId, now), persistence: "volatile" };
  }
  if (mainRaw) {
    const parsed = parseDocument(mainRaw, profileId, now);
    if (parsed.kind === "future") return { document: emptyLumaDocument(profileId, now), persistence: "future-schema" };
    if (parsed.kind === "valid") return { document: parsed.document, persistence: "ready" };
  }
  if (backupRaw) {
    const parsed = parseDocument(backupRaw, profileId, now);
    if (parsed.kind === "future") return { document: emptyLumaDocument(profileId, now), persistence: "future-schema" };
    if (parsed.kind === "valid") return { document: parsed.document, persistence: "recovered" };
  }
  const document = emptyLumaDocument(profileId, now);
  const ownsLegacyMigration = claimLegacyMigration(profileId);
  document.queue = ownsLegacyMigration ? migrateLegacyQueue() : [];
  document.resumes = ownsLegacyMigration ? migrateLegacyResume(now) : [];
  document.migration = {
    legacyQueueImported: true,
    legacyResumeImported: true,
    completedAt: now,
  };
  return { document, persistence: "ready" };
}

export function saveLumaDocument(document: LumaDocumentV1): boolean {
  const key = lumaStorageKey(document.profileId);
  const backupKey = lumaBackupKey(document.profileId);
  try {
    const current = localStorage.getItem(key);
    if (current) {
      const parsed = parseDocument(current, document.profileId, Date.now());
      if (parsed.kind === "valid") setItemWithRecovery(backupKey, current);
      if (parsed.kind === "future") return false;
    }
    return setItemWithRecovery(key, JSON.stringify(document));
  } catch {
    return false;
  }
}

export function parseLumaStorageEvent(raw: string | null, profileId: string, now = Date.now()): LumaDocumentV1 | null {
  if (!raw) return null;
  const parsed = parseDocument(raw, profileId, now);
  return parsed.kind === "valid" ? parsed.document : null;
}
