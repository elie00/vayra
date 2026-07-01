import { invoke } from "@tauri-apps/api/core";

let flatpak: Promise<boolean> | undefined;

/** True only when the native process was launched by Flatpak. */
export function isFlatpak(): Promise<boolean> {
  if (!("__TAURI_INTERNALS__" in window)) return Promise.resolve(false);
  return (flatpak ??= invoke<boolean>("harbor_is_flatpak").catch(() => false));
}
