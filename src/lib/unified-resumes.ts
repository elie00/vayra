import type { LumaResumeEntry } from "./luma/types";
import type { LibraryItem } from "./stremio";

export type UnifiedResume = { kind: "local"; entry: LumaResumeEntry; at: number } | { kind: "connected"; item: LibraryItem; at: number };

/** Presentation-only merge: never delete history from either authority. */
export function unifiedResumes(local: LumaResumeEntry[], connected: LibraryItem[]): UnifiedResume[] {
  const titleKey = (title: string, type: string) => `${type === "movie" ? "movie" : "series"}:${title.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "")}`;
  const candidates: UnifiedResume[] = [
    ...local.map((entry): UnifiedResume => ({ kind: "local", entry, at: entry.updatedAt })),
    ...connected.map((item): UnifiedResume => ({ kind: "connected", item, at: Date.parse(item.state?.lastWatched ?? item._mtime) || 0 })),
  ];
  candidates.sort((a, b) => b.at - a.at || (a.kind === "local" ? -1 : 1));
  const ids = new Set<string>();
  const names = new Set<string>();
  return candidates.filter((candidate) => {
    const id = candidate.kind === "local" ? (candidate.entry.ref.kind === "catalog" ? candidate.entry.ref.metaId : `local:${candidate.entry.ref.entryId}`) : candidate.item._id;
    const title = candidate.kind === "local" ? candidate.entry.presentation.title : candidate.item.name;
    const type = candidate.kind === "local" ? candidate.entry.ref.mediaType : candidate.item.type;
    const name = titleKey(title, type);
    if (ids.has(id) || (title.trim() && names.has(name))) return false;
    ids.add(id);
    if (title.trim()) names.add(name);
    return true;
  });
}
