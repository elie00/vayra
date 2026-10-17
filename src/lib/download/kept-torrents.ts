import { isLocalEngineUrl } from "@/lib/stremio-server";
import { engineFileFromUrl } from "@/lib/torrent/local-engine";
import type { DownloadItem } from "./downloads-store";

/** The engine torrents a save may still need: anything not finished or canceled can resume. */
export function torrentsKeptByDownloads(items: readonly Pick<DownloadItem, "status" | "url">[]): string[] {
  const kept = new Set<string>();
  for (const item of items) {
    if (item.status === "done" || item.status === "canceled" || !isLocalEngineUrl(item.url)) continue;
    const file = engineFileFromUrl(item.url);
    if (file) kept.add(file.infoHash);
  }
  return [...kept];
}
