import type { View } from "@/lib/view";

export const MAC_PRIMARY_VIEWS = ["home", "discover", "library", "downloads"] as const;
export const MAC_EXPLORE_VIEWS = ["discover", "movies", "shows", "anime", "catalogs", "live", "sports", "vod", "calendar", "kids"] as const;
export function isExploreView(view: string): boolean {
  return (MAC_EXPLORE_VIEWS as readonly string[]).includes(view);
}
export function sanitizeMacPins(value: unknown): View[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is View => typeof id === "string" && id !== "discover" && isExploreView(id)))];
}
