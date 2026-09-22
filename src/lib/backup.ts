import { downloadText } from "@/lib/download-text";
import { loadBgImage, saveBgImage } from "@/lib/theme-storage";
import { isBackupActivityKey, isBackupSettingsKey, mergeBackupSettings, portableBackground, sanitizeBackupEntry } from "./backup-safety";

declare const __APP_VERSION__: string;

const FORMAT = "vayra-backup";
const LEGACY_FORMAT = "harbor-backup";
const VERSION = 2;

export type Backup = {
  format: string;
  version: number;
  app: string;
  exportedAt: string;
  data: Record<string, string>;
  bgImage?: string | null;
  includesLocalActivity?: boolean;
};

export async function buildBackup(options: { includeLocalActivity?: boolean } = {}): Promise<Backup> {
  const includeLocalActivity = options.includeLocalActivity === true;
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || (!isBackupSettingsKey(key) && !(includeLocalActivity && isBackupActivityKey(key)))) continue;
    const value = localStorage.getItem(key);
    if (value === null) continue;
    const portable = sanitizeBackupEntry(key, value, includeLocalActivity);
    if (portable !== undefined) data[key] = portable;
  }
  const bgImage = portableBackground(await loadBgImage());
  return {
    format: FORMAT,
    version: VERSION,
    app: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev",
    exportedAt: new Date().toISOString(),
    data,
    includesLocalActivity: includeLocalActivity,
    ...(bgImage ? { bgImage } : {}),
  };
}

export async function downloadBackup(options: { includeLocalActivity?: boolean } = {}): Promise<boolean> {
  const backup = await buildBackup(options);
  const text = JSON.stringify(backup, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  return downloadText(`vayra-backup-${stamp}.vayrx`, text, ["vayrx"], "VAYRA backup");
}

export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; error: string };

export function parseBackup(text: string): ParsedBackup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (!json || typeof json !== "object") {
    return { ok: false, error: "Unrecognized file." };
  }
  const b = json as Partial<Backup>;
  if (b.format !== FORMAT && b.format !== LEGACY_FORMAT) {
    return { ok: false, error: "This is not a VAYRA backup file." };
  }
  if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) {
    return { ok: false, error: "This backup has no data in it." };
  }
  if (typeof b.version === "number" && b.version > VERSION) {
    return { ok: false, error: "This backup needs a newer version of VAYRA." };
  }
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.data)) {
    if (typeof v !== "string") continue;
    const portable = sanitizeBackupEntry(k, v, true);
    if (portable !== undefined) data[k] = portable;
  }
  if (Object.keys(data).length === 0) {
    return { ok: false, error: "This backup contained nothing restorable." };
  }
  return {
    ok: true,
    backup: {
      format: FORMAT,
      version: typeof b.version === "number" ? b.version : VERSION,
      app: typeof b.app === "string" ? b.app : "unknown",
      exportedAt: typeof b.exportedAt === "string" ? b.exportedAt : "",
      data,
      includesLocalActivity: Object.keys(data).some(isBackupActivityKey),
      ...(portableBackground(b.bgImage) !== undefined ? { bgImage: portableBackground(b.bgImage) } : {}),
    },
  };
}

export function backupKeyCount(backup: Backup): number {
  return Object.keys(backup.data).length;
}

export class BackupRestoreError extends Error {
  constructor(message: string, readonly retryRecovery?: () => Promise<void>) {
    super(message);
    this.name = "BackupRestoreError";
  }
}

/** No clears: excluded stores and locally held credentials always stay in place. */
export async function applyBackup(backup: Backup): Promise<void> {
  const before = new Map<string, string | null>();
  const next = new Map<string, string>();
  const background = portableBackground(backup.bgImage);
  let oldBackground: string | null = null;
  try {
    for (const [key, raw] of Object.entries(backup.data)) {
      const safe = sanitizeBackupEntry(key, raw, backup.includesLocalActivity === true);
      if (safe === undefined) continue;
      const current = localStorage.getItem(key);
      before.set(key, current);
      next.set(key, isBackupSettingsKey(key) ? mergeBackupSettings(current, safe) : safe);
    }
    if (background !== undefined) oldBackground = await loadBgImage();
  } catch {
    throw new BackupRestoreError("The current preferences could not be read. Nothing was restored.");
  }
  if (next.size === 0) throw new BackupRestoreError("This backup contained nothing restorable.");

  const touched = new Set<string>();
  let backgroundTouched = false;
  const rollback = async () => {
    let failed = false;
    // Free newly allocated entries first, so quota pressure cannot prevent recovery.
    // Shrink changed entries before growing others back to their former size.
    // Otherwise an intermediate rollback step could hit a quota even when the
    // complete original snapshot still fits.
    const recoveryOrder = [...touched].sort((a, b) =>
      ((before.get(a)?.length ?? 0) - (next.get(a)?.length ?? 0)) -
      ((before.get(b)?.length ?? 0) - (next.get(b)?.length ?? 0)),
    );
    for (const key of recoveryOrder) {
      if (before.get(key) !== null) continue;
      try { localStorage.removeItem(key); } catch { failed = true; }
    }
    for (const key of recoveryOrder) {
      const value = before.get(key) ?? null;
      try {
        if (localStorage.getItem(key) === value) continue;
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
        if (localStorage.getItem(key) !== value) failed = true;
      } catch { failed = true; }
    }
    if (backgroundTouched) {
      try { if (await saveBgImage(oldBackground) !== true) failed = true; } catch { failed = true; }
    }
    if (failed) throw new BackupRestoreError("Recovery is incomplete. Keep VAYRA open and retry recovery.", rollback);
  };
  try {
    for (const [key, value] of next) {
      if (before.get(key) === value) continue;
      touched.add(key);
      localStorage.setItem(key, value);
      if (localStorage.getItem(key) !== value) throw new Error("Write verification failed");
    }
    if (background !== undefined && background !== oldBackground) {
      backgroundTouched = true;
      if (await saveBgImage(background) !== true) throw new Error("Background write failed");
    }
  } catch {
    await rollback();
    throw new BackupRestoreError("Restore failed. Your previous preferences were recovered. Free some space and retry, or choose another backup.");
  }
}
