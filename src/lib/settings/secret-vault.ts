import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "./types";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const SECRET_KEYS = [
  "tmdbKey",
  "omdbKey",
  "rpdbKey",
  "fanartKey",
  "tvdbKey",
  "rdKey",
  "tbKey",
  "adKey",
  "pmKey",
  "dlKey",
  "traktClientSecret",
  "traktAccessToken",
  "traktRefreshToken",
  "togetherCfToken",
  "webhooks",
  "iptvPlaylists",
  "remoteStreamServerUrl",
  "aiSearchKey",
  "mdblistKey",
  "opensubtitlesApiKey",
  "jimakuToken",
] as const satisfies readonly (keyof Settings)[];

export type SecretKey = (typeof SECRET_KEYS)[number];
export type SettingsSecrets = Partial<Pick<Settings, SecretKey>>;

/**
 * The OS keychain holds one entry. Version 2 keeps every settings source (shared or
 * per-profile) under `sources`, and repeats the active source's secrets at the top
 * level, which is all an older VAYRA reads — rolling back keeps the active keys.
 */
type VaultPayload = SettingsSecrets & { v?: number; sources?: Record<string, SettingsSecrets> };

const vault: { active: boolean; activeKey: string; sources: Record<string, SettingsSecrets> } = {
  active: false,
  activeKey: "",
  sources: {},
};

export function pickSecrets(value: Partial<Settings> | Record<string, unknown>): SettingsSecrets {
  const out: Record<string, unknown> = {};
  for (const key of SECRET_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = (value as Record<string, unknown>)[key];
  }
  return out as SettingsSecrets;
}

export function withoutSecrets<T extends object>(value: T): T {
  const out = { ...value } as Record<string, unknown>;
  for (const key of SECRET_KEYS) delete out[key];
  return out as T;
}

/** True once every known source's secrets live in the keychain, so blobs may drop them. */
export function vaultActive(): boolean {
  return vault.active;
}

export function vaultSecretsFor(sourceKey: string): SettingsSecrets {
  return vault.active ? { ...vault.sources[sourceKey] } : {};
}

export function activeVaultSecret<K extends SecretKey>(key: K): Settings[K] | undefined {
  return vault.active ? vault.sources[vault.activeKey]?.[key] as Settings[K] | undefined : undefined;
}

function payload(): string {
  const body: VaultPayload = { ...vault.sources[vault.activeKey], v: 2, sources: vault.sources };
  return JSON.stringify(body);
}

let writes: Promise<unknown> = Promise.resolve();

/** Writes run one after another and serialize the vault when they start, so the last
 * write to land is always the latest state. */
function writeVault(): Promise<void> {
  const next = writes.catch(() => undefined).then(() => invoke("settings_secrets_write", { content: payload() }));
  writes = next;
  return next.then(() => undefined);
}

/** Put secrets that only exist in the vault back into their blobs, so nothing is lost. */
function restoreBlobs(): void {
  for (const [key, secrets] of Object.entries(vault.sources)) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      localStorage.setItem(key, JSON.stringify({ ...(JSON.parse(raw) as object), ...secrets }));
    } catch {
      continue;
    }
  }
}

function disable(): void {
  if (!vault.active) return;
  restoreBlobs();
  vault.active = false;
}

function readBlob(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw == null ? null : (JSON.parse(raw) as unknown);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Load the keychain, move every secret still sitting in a settings blob into it, and
 * strip the blobs only after the keychain write succeeded. `sourceKeys` lists every
 * blob that may carry secrets; `activeKey` is the one the app is using.
 */
export async function hydrateSecretVault(activeKey: string, sourceKeys: string[], mirrorKey: string): Promise<boolean> {
  if (!isTauri) return false;
  let stored: VaultPayload | null;
  try {
    const raw = await invoke<string | null>("settings_secrets_read");
    stored = raw ? (JSON.parse(raw) as VaultPayload) : null;
  } catch {
    return false;
  }
  const sources: Record<string, SettingsSecrets> = {};
  if (stored?.v === 2 && stored.sources) {
    for (const [key, secrets] of Object.entries(stored.sources)) sources[key] = pickSecrets(secrets);
  } else if (stored) {
    sources[activeKey] = pickSecrets(stored);
  }
  const blobs = [...new Set([...sourceKeys, mirrorKey])];
  for (const key of blobs) {
    const blob = readBlob(key);
    if (!blob) continue;
    // The mirror is a copy of the active source, never a source of its own.
    const target = key === mirrorKey ? activeKey : key;
    sources[target] = { ...pickSecrets(blob), ...sources[target] };
  }
  vault.sources = sources;
  vault.activeKey = activeKey;
  try {
    await writeVault();
  } catch {
    vault.sources = {};
    return false;
  }
  vault.active = true;
  for (const key of blobs) {
    const blob = readBlob(key);
    if (!blob) continue;
    try {
      localStorage.setItem(key, JSON.stringify(withoutSecrets(blob)));
    } catch {
      continue;
    }
  }
  return true;
}

/** Record a source's secrets; the keychain is rewritten only when something changed. */
export function stashSecrets(sourceKey: string, secrets: SettingsSecrets): void {
  if (!vault.active) return;
  const changed =
    vault.activeKey !== sourceKey || JSON.stringify(vault.sources[sourceKey] ?? {}) !== JSON.stringify(secrets);
  vault.activeKey = sourceKey;
  vault.sources = { ...vault.sources, [sourceKey]: secrets };
  if (changed) void flushSecretVault();
}

export function copyVaultSecrets(from: string, to: string): void {
  if (!vault.active || !vault.sources[from]) return;
  vault.sources = { ...vault.sources, [to]: { ...vault.sources[from] } };
  void flushSecretVault();
}

export function dropVaultSecrets(sourceKey: string): void {
  if (!vault.active || !vault.sources[sourceKey]) return;
  const { [sourceKey]: _dropped, ...rest } = vault.sources;
  void _dropped;
  vault.sources = rest;
  void flushSecretVault();
}

/** Write the vault; on failure fall back to the blobs so credentials survive. */
export async function flushSecretVault(): Promise<boolean> {
  if (!vault.active) return false;
  try {
    await writeVault();
    return true;
  } catch (error) {
    console.warn("[settings] secure credential storage unavailable; using legacy storage", error);
    disable();
    return false;
  }
}

export function resetSecretVaultForTests(): void {
  vault.active = false;
  vault.activeKey = "";
  vault.sources = {};
  writes = Promise.resolve();
}
