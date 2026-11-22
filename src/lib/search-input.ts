import { isDirectVideoUrl, isMagnetInput } from "@/lib/torrent/magnet";

export function searchInputKind(query: string): "text" | "magnet" | "video" | "link" {
  const value = query.trim();
  if (isMagnetInput(value)) return "magnet";
  if (isDirectVideoUrl(value)) return "video";
  if (/^(?:https?:|(?:[a-z][a-z0-9+.-]*:)?\/\/)/i.test(value)) return "link";
  return "text";
}
