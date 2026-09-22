import { loadStoredSettings } from "./load";
import type { Settings } from "./types";
import { copyVaultSecrets, dropVaultSecrets, pickSecrets, stashSecrets, vaultActive, vaultSecretsFor, withoutSecrets } from "./secret-vault";

export const MIRROR_KEY = "harbor.settings";
export const SHARED_KEY = "harbor.settings.shared";

export function profileKey(id: string): string {
  return `harbor.settings.${id}`;
}

export function sourceKeyFor(profileId: string, linked: boolean): string {
  return linked ? SHARED_KEY : profileKey(profileId);
}

export function serializeSettings(settings: Settings): string {
  const { backgroundImage: _drop, ...themeRest } = settings.theme;
  void _drop;
  return JSON.stringify({ ...settings, theme: themeRest });
}

export function seedSharedFromLegacy(): void {
  try {
    if (localStorage.getItem(SHARED_KEY) != null) return;
    const legacy = localStorage.getItem(MIRROR_KEY);
    if (legacy != null) localStorage.setItem(SHARED_KEY, legacy);
  } catch {
    return;
  }
}

/** Every blob that can hold settings of its own: the shared one and each profile's. */
export function allSourceKeys(): string[] {
  try {
    const raw = localStorage.getItem("harbor.profiles.v1");
    const ids = raw ? ((JSON.parse(raw) as { profiles?: Array<{ id: string }> }).profiles ?? []).map((p) => p.id) : [];
    return [SHARED_KEY, ...ids.map(profileKey)];
  } catch {
    return [SHARED_KEY];
  }
}

function loadWithSecrets(key: string): Settings {
  return { ...loadStoredSettings(key), ...vaultSecretsFor(key) };
}

export function loadEffective(profileId: string, linked: boolean): Settings {
  const key = sourceKeyFor(profileId, linked);
  if (localStorage.getItem(key) != null) return loadWithSecrets(key);
  if (localStorage.getItem(SHARED_KEY) != null) return loadWithSecrets(SHARED_KEY);
  if (localStorage.getItem(MIRROR_KEY) != null) return loadStoredSettings(MIRROR_KEY);
  return loadWithSecrets(key);
}

export function recoverableLegacyBlob(): string | null {
  return localStorage.getItem(SHARED_KEY) ?? localStorage.getItem(MIRROR_KEY);
}

function readActiveSourceForRecovery(): { profileId: string; linked: boolean } {
  try {
    const raw = localStorage.getItem("harbor.profiles.v1");
    if (!raw) return { profileId: "default", linked: true };
    const s = JSON.parse(raw) as {
      profiles?: Array<{ id: string; settingsLinked?: boolean }>;
      activeId?: string | null;
    };
    const id = s.activeId || "default";
    const p = s.profiles?.find((x) => x.id === id);
    return { profileId: id, linked: p?.settingsLinked !== false };
  } catch {
    return { profileId: "default", linked: true };
  }
}

export function applyLegacyToActive(): boolean {
  const blob = recoverableLegacyBlob();
  if (blob == null) return false;
  const { profileId, linked } = readActiveSourceForRecovery();
  try {
    localStorage.setItem(sourceKeyFor(profileId, linked), blob);
    localStorage.setItem(MIRROR_KEY, blob);
    if (localStorage.getItem(SHARED_KEY) != null) copyVaultSecrets(SHARED_KEY, sourceKeyFor(profileId, linked));
    return true;
  } catch {
    return false;
  }
}

export function persistEffective(settings: Settings, profileId: string, linked: boolean): string {
  const key = sourceKeyFor(profileId, linked);
  const secure = vaultActive();
  const json = serializeSettings(secure ? withoutSecrets(settings) : settings);
  localStorage.setItem(MIRROR_KEY, json);
  localStorage.setItem(key, json);
  if (secure) stashSecrets(key, pickSecrets(settings));
  return json;
}

export function forkToProfile(profileId: string): void {
  try {
    const shared = localStorage.getItem(SHARED_KEY) ?? localStorage.getItem(MIRROR_KEY);
    if (shared != null) localStorage.setItem(profileKey(profileId), shared);
    if (localStorage.getItem(SHARED_KEY) != null) copyVaultSecrets(SHARED_KEY, profileKey(profileId));
  } catch {
    return;
  }
}

export function dropProfileBlob(profileId: string): void {
  dropVaultSecrets(profileKey(profileId));
  try {
    localStorage.removeItem(profileKey(profileId));
  } catch {
    return;
  }
}
