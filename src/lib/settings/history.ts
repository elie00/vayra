import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "./types";

export const HISTORY_KEYS = ["uiLanguage", "tmdbLanguage", "tmdbImageLangs", "preferredSubLangs", "preferredAudioLangs", "resumePrompt", "resumePlayback", "instantPlay", "rememberLastStream", "keepSourceNextEpisode", "autoPlayNextEpisode", "sidebarCollapsed", "macPinnedViews", "posterScale", "posterRadius", "uiScale", "subFontSize", "subBold", "subtitlesOffByDefault", "preferEmbeddedSubs", "downloadCreateFolders", "playerVolumeHud", "fullscreenRestorePosition", "keepFullscreenOnExit"] as const satisfies readonly (keyof Settings)[];
export type SettingsCheckpoint = { savedAt: number; settings: Record<string, unknown> };
export function historyPreferences(settings: Partial<Settings>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const key of HISTORY_KEYS) if (settings[key] !== undefined) safe[key] = settings[key];
  if (settings.theme) safe.theme = { preset: settings.theme.preset, fontPair: settings.theme.fontPair, fontPairOverride: settings.theme.fontPairOverride ?? false };
  return safe;
}
export async function recordSettingsCheckpoint(settings: Settings): Promise<void> {
  try {
    await invoke("settings_history_record", { content: JSON.stringify(historyPreferences(settings)) });
    localStorage.removeItem("vayra.settings.history.error");
  } catch {
    localStorage.setItem("vayra.settings.history.error", "1");
  }
}
export function readSettingsHistory(): Promise<SettingsCheckpoint[]> { return invoke("settings_history_list"); }

export function checkpointPatch(checkpoint: SettingsCheckpoint, current: Settings): Partial<Settings> {
  const safe = historyPreferences(checkpoint.settings as Partial<Settings>);
  const patch: Record<string, unknown> = {};
  for (const key of HISTORY_KEYS) {
    const value = safe[key];
    if (Array.isArray(current[key]) ? Array.isArray(value) && value.every((v) => typeof v === "string") : typeof value === typeof current[key]) patch[key] = value;
  }
  if (safe.theme) patch.theme = { ...current.theme, ...safe.theme as object };
  return patch as Partial<Settings>;
}
