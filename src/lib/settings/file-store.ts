import { invoke } from "@tauri-apps/api/core";
import { STORAGE_KEY } from "./defaults";
import type { Settings } from "./types";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function readSettingsFile(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    return (await invoke<string | null>("settings_read")) ?? null;
  } catch {
    return null;
  }
}

export async function writeSettingsFile(content: string): Promise<boolean> {
  if (!isTauri) return false;
  try {
    await invoke("settings_write", { content });
    return true;
  } catch {
    return false;
  }
}

const SECRET_KEYS = [
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

type SecretKey = (typeof SECRET_KEYS)[number];
type SettingsSecrets = Pick<Settings, SecretKey>;

export async function readSettingsSecrets(): Promise<Partial<SettingsSecrets> | null> {
  if (!isTauri) return null;
  try {
    const raw = await invoke<string | null>("settings_secrets_read");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SettingsSecrets>;
    return Object.fromEntries(
      SECRET_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(parsed, key)).map((key) => [
        key,
        parsed[key],
      ]),
    ) as Partial<SettingsSecrets>;
  } catch {
    return null;
  }
}

export async function persistSettings(settings: Settings): Promise<void> {
  const { backgroundImage: _drop, ...themeRest } = settings.theme;
  void _drop;
  const serializable = { ...settings, theme: themeRest } as Settings;
  if (!isTauri) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    return;
  }

  const persisted = { ...serializable } as Settings;
  const secrets = {} as SettingsSecrets;
  for (const key of SECRET_KEYS) {
    // Assignment is safe because both objects are indexed by the same key union.
    (secrets as Record<SecretKey, Settings[SecretKey]>)[key] = settings[key];
    delete (persisted as Partial<Settings>)[key];
  }

  try {
    await invoke("settings_secrets_write", { content: JSON.stringify(secrets) });
    const json = JSON.stringify(persisted);
    localStorage.setItem(STORAGE_KEY, json);
    await writeSettingsFile(json);
  } catch (error) {
    // Never lose credentials when the OS keyring is unavailable (for example a
    // headless Linux session). Keep the legacy storage and make the downgrade visible.
    console.warn("[settings] secure credential storage unavailable; using legacy storage", error);
    const fallback = JSON.stringify(serializable);
    localStorage.setItem(STORAGE_KEY, fallback);
    await writeSettingsFile(fallback);
  }
}
