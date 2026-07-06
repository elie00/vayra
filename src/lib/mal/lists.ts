import { malRequest } from "./client";
import type { MalListEntry, MalListGroup, MalListStatus } from "./types";

type RawNode = {
  id: number;
  title: string;
  main_picture: { medium: string; large: string } | null;
  alternative_titles: { synonyms: string[]; en: string; ja: string } | null;
  num_episodes: number | null;
  mean: number | null;
  list_status: {
    status: string;
    score: number;
    num_episodes_watched: number;
    is_rewatching: boolean;
    updated_at: string;
  };
};

type RawEntry = { node: RawNode };
type ListResponse = { data: RawEntry[]; paging: { next?: string } | null };

function parseNode(n: RawNode): MalListEntry | null {
  if (!n.list_status) return null;
  return {
    status: n.list_status.status as MalListStatus,
    score: n.list_status.score,
    numEpisodesWatched: n.list_status.num_episodes_watched,
    isRewatching: n.list_status.is_rewatching,
    updatedAt: n.list_status.updated_at,
    anime: {
      id: n.id,
      title: n.title,
      mainPicture: n.main_picture?.large ?? n.main_picture?.medium ?? null,
      numEpisodes: n.num_episodes,
      mean: n.mean,
    },
  };
}

export async function fetchMalList(): Promise<MalListGroup[]> {
  const all: MalListEntry[] = [];
  let cursor: string | null = `/users/@me/animelist?fields=list_status,num_episodes,mean,main_picture,alternative_titles&nsfw=true&limit=1000`;
  while (cursor) {
    const data: ListResponse = await malRequest(cursor);
    for (const entry of data.data) { const parsed = parseNode(entry.node); if (parsed) all.push(parsed); }
    cursor = data.paging?.next ?? null;
  }

  const byStatus = new Map<MalListStatus, MalListEntry[]>();
  const seen = new Set<number>();
  for (const entry of all) {
    if (seen.has(entry.anime.id)) continue;
    seen.add(entry.anime.id);
    const bucket = byStatus.get(entry.status) ?? [];
    bucket.push(entry);
    byStatus.set(entry.status, bucket);
  }

  const order: MalListStatus[] = ["watching", "completed", "on_hold", "dropped", "plan_to_watch"];
  return order
    .filter((s) => byStatus.has(s))
    .map((status) => ({ status, entries: byStatus.get(status)! }));
}
