import type { InstallResult, StremioSyncStatus } from "@/lib/addon-store";

type Translate = (key: string) => string;

export function addonSyncMessage(status: StremioSyncStatus, t: Translate): string {
  if (status === "synced") return t("Synced to your Stremio account.");
  if (status === "failed") return t("Saved locally, but Stremio sync failed. Check your Stremio connection in Settings before trying again.");
  return t("Stremio is not connected. The addon is available on this device only.");
}

export function addonInstallMessage(result: Pick<InstallResult, "replaced" | "syncStatus">, t: Translate): string {
  const local = t(result.replaced ? "Updated locally" : "Installed locally");
  return `${local} · ${addonSyncMessage(result.syncStatus, t)}`;
}
