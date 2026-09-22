import { invoke } from "@tauri-apps/api/core";
import type { Meta } from "@/lib/cinemeta";
import type { PlayEpisode, PlayerSrc } from "@/lib/view";
import type { DownloadItem } from "./downloads-store";

export function completedDownloadFor(items: DownloadItem[], metaId: string, episode?: PlayEpisode): DownloadItem | undefined {
  return items.find((d) => d.metaId === metaId && d.status === "done" && d.receivedBytes > 0 &&
    (episode ? d.season === episode.season && d.episode === episode.episode : d.season == null && d.episode == null));
}
export async function validatedDownloadSource(item: DownloadItem, meta?: Meta, episode?: PlayEpisode): Promise<PlayerSrc | null> {
  if (item.status !== "done" || item.path.endsWith(".part") || item.receivedBytes <= 0) return null;
  const expectedBytes = item.totalBytes ?? item.receivedBytes;
  if (expectedBytes !== item.receivedBytes) return null;
  const valid = await invoke<boolean>("download_file_valid", { path: item.path, expectedBytes }).catch(() => false);
  if (!valid) return null;
  return {
    meta: meta ?? { id: item.metaId, name: item.title, type: item.season == null ? "movie" : "series", poster: item.poster ?? undefined },
    episode: episode ?? (item.season != null && item.episode != null ? { season: item.season, episode: item.episode } : undefined),
    url: item.path, title: item.title, notWebReady: true, resume: true,
  };
}
