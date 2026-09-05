import type { DownloadItem } from "./downloads-store";
type T = (key: string) => string;

export function downloadStatusLabel(status: DownloadItem["status"], t: T): string {
  switch (status) {
    case "downloading": return t("Downloading");
    case "queued": return t("Waiting");
    case "paused": return t("Download paused");
    case "interrupted": case "error": return t("Needs resuming");
    case "done": return t("Ready to watch");
    case "canceled": return t("Canceled");
  }
}
export function downloadRecoveryHint(error: string | null, t: T): string {
  if (/space|enospc|disk full/i.test(error ?? "")) return t("Free up space in the download folder before resuming.");
  if (/401|403|404|expired/i.test(error ?? "")) return t("The source is no longer available. Choose another source from the title page.");
  return t("Check your connection, then resume. The saved portion is kept when the source supports resuming.");
}
