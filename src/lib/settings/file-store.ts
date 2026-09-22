import { invoke } from "@tauri-apps/api/core";
import { STORAGE_KEY } from "./defaults";
import type { Settings } from "./types";
import { recordSettingsCheckpoint } from "./history";
import { isMacDesktop } from "../platform";
import { flushSecretVault, vaultActive, withoutSecrets } from "./secret-vault";

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

export async function persistSettings(settings: Settings): Promise<void> {
  if (isMacDesktop()) await recordSettingsCheckpoint(settings);
  const { backgroundImage: _drop, ...themeRest } = settings.theme;
  void _drop;
  const serializable = { ...settings, theme: themeRest } as Settings;
  if (!isTauri) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    return;
  }

  if (vaultActive() && (await flushSecretVault())) {
    const json = JSON.stringify(withoutSecrets(serializable));
    localStorage.setItem(STORAGE_KEY, json);
    await writeSettingsFile(json);
    return;
  }
  // Never lose credentials when the OS keyring is unavailable (for example a
  // headless Linux session): keep them in the legacy storage.
  const fallback = JSON.stringify(serializable);
  localStorage.setItem(STORAGE_KEY, fallback);
  await writeSettingsFile(fallback);
}
