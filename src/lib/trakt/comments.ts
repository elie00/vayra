import { traktRequest } from "./client";
import type { TraktTarget } from "./types";

export type TraktComment = {
  id: number;
  comment: string;
  spoiler: boolean;
  review: boolean;
  replies: number;
  likes: number;
  createdAt: string;
  userRating: number | null;
  user: {
    username: string;
    name: string | null;
    avatar: string | null;
  };
};

type RawComment = {
  id: number;
  parent_id: number;
  created_at: string;
  updated_at: string;
  comment: string;
  spoiler: boolean;
  review: boolean;
  replies: number;
  likes: number;
  user_stats?: { rating: number; play_count: number; completed_count: number };
  user: {
    username: string;
    private: boolean;
    name: string | null;
    vip: boolean;
    vip_ep: boolean;
    ids: { slug: string };
    images?: { avatar?: { full?: string } };
  };
};

function pickId(ids: { tmdb?: number; imdb?: string }): string {
  if (ids.imdb) return ids.imdb;
  if (ids.tmdb) return `tmdb:${ids.tmdb}`;
  return "";
}

function showPath(target: TraktTarget): string {
  if (target.kind === "episode") return pickId(target.show.ids);
  return pickId(target.ids);
}

export function commentsPath(target: TraktTarget, sort: string): string {
  const id = showPath(target);
  if (target.kind === "episode") {
    return `/shows/${id}/seasons/${target.season}/episodes/${target.number}/comments/${sort}`;
  }
  if (target.kind === "movie") {
    return `/movies/${id}/comments/${sort}`;
  }
  return `/shows/${id}/comments/${sort}`;
}

function mapComment(raw: RawComment): TraktComment {
  return {
    id: raw.id,
    comment: raw.comment,
    spoiler: raw.spoiler,
    review: raw.review,
    replies: raw.replies,
    likes: raw.likes,
    createdAt: raw.created_at,
    userRating: raw.user_stats?.rating ?? null,
    user: {
      username: raw.user.username,
      name: raw.user.name,
      avatar: raw.user.images?.avatar?.full ?? null,
    },
  };
}

export async function fetchComments(
  target: TraktTarget,
  sort: string = "likes",
): Promise<TraktComment[]> {
  const path = commentsPath(target, sort);
  const raw = await traktRequest<RawComment[]>(path).catch(() => [] as RawComment[]);
  return raw.filter((c) => !c.spoiler).map(mapComment);
}
