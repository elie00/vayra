import type { Meta } from "@/lib/cinemeta";
import type { PlayEpisode } from "@/lib/view";

export const LUMA_SCHEMA_VERSION = 1 as const;
export const LUMA_QUEUE_LIMIT = 50;
export const LUMA_RESUME_LIMIT = 60;
export const LUMA_FINISHED_RATIO = 0.92;
export const LUMA_RESUME_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;

export type LumaMediaType = "movie" | "series";

export type LumaEpisodeRef = {
  season: number;
  episode: number;
  canonicalVideoId?: string;
};

export type LumaMediaRef =
  | {
      kind: "catalog";
      metaId: string;
      mediaType: LumaMediaType;
      episode?: LumaEpisodeRef;
    }
  | {
      kind: "local-library";
      entryId: string;
      mediaType: LumaMediaType;
      episode?: LumaEpisodeRef;
    };

export type LumaPresentation = {
  title: string;
  episodeTitle?: string;
  artwork?: string;
};

export type LumaQueueItem = {
  id: string;
  ref: LumaMediaRef;
  presentation: LumaPresentation;
  addedAt: number;
};

export type LumaResumeEntry = {
  id: string;
  ref: LumaMediaRef;
  presentation: LumaPresentation;
  positionMs: number;
  durationMs: number;
  updatedAt: number;
};

export type LumaPreferences = {
  autoAdvance: boolean;
  rememberActivity: boolean;
};

export type LumaDocumentV1 = {
  schemaVersion: typeof LUMA_SCHEMA_VERSION;
  revision: number;
  updatedAt: number;
  profileId: string;
  queue: LumaQueueItem[];
  resumes: LumaResumeEntry[];
  preferences: LumaPreferences;
  migration: {
    legacyQueueImported: boolean;
    legacyResumeImported: boolean;
    completedAt: number;
  };
};

export type LumaPersistenceState = "ready" | "recovered" | "volatile" | "future-schema";

export type LumaAuthority = "solo" | "cast" | "together-host" | "together-guest" | "vara-host" | "vara-guest";

export type LumaErrorCode =
  | "authority-blocked"
  | "duplicate"
  | "future-schema"
  | "invalid-media"
  | "queue-empty"
  | "queue-full"
  | "storage-unavailable";

export type LumaError = {
  code: LumaErrorCode;
  message: string;
};

export type LumaResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: LumaError };

export type LumaSnapshot = {
  document: LumaDocumentV1;
  persistence: LumaPersistenceState;
  pendingItemId: string | null;
  lastError: LumaError | null;
};

export type LumaMediaInput = {
  meta: Meta;
  episode?: PlayEpisode;
};

export type LumaProgressInput = LumaMediaInput & {
  positionMs: number;
  durationMs: number;
  updatedAt?: number;
};

export function lumaRefKey(ref: LumaMediaRef): string {
  const base = ref.kind === "catalog" ? `catalog:${ref.metaId}` : `local:${ref.entryId}`;
  return ref.episode ? `${base}:${ref.episode.season}:${ref.episode.episode}` : base;
}

