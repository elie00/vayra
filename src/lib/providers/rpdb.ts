let posterBase = "";

export function setPosterBaseUrl(url: string): void {
  posterBase = url.trim().replace(/\/+$/, "");
}

type ParsedId = {
  imdb?: string;
  tmdbId?: string;
  mediaType: "movie" | "series";
};

function parseMetaId(metaId: string): ParsedId | undefined {
  if (metaId.startsWith("tt")) return { imdb: metaId, mediaType: "movie" };
  const tmdb = metaId.match(/^tmdb:(movie|tv):(\d+)$/);
  if (tmdb) {
    return { tmdbId: tmdb[2], mediaType: tmdb[1] === "tv" ? "series" : "movie" };
  }
  return undefined;
}

function fillTemplate(template: string, id: ParsedId): string | undefined {
  const idToken = id.imdb ?? (id.tmdbId ? `${id.mediaType}-${id.tmdbId}` : undefined);
  if (!idToken) return undefined;
  let out = template;
  const sub = (token: string, value: string | undefined): boolean => {
    if (!out.includes(token)) return true;
    if (!value) return false;
    out = out.split(token).join(value);
    return true;
  };
  if (!sub("{imdbId}", id.imdb)) return undefined;
  if (!sub("{imdb_id}", id.imdb)) return undefined;
  if (!sub("{tmdbId}", id.tmdbId)) return undefined;
  if (!sub("{tmdb_id}", id.tmdbId)) return undefined;
  sub("{type}", id.mediaType);
  sub("{mediaType}", id.mediaType);
  if (!sub("{id}", idToken)) return undefined;
  return out;
}

function rpdbPath(base: string, key: string, id: ParsedId): string | undefined {
  const keySeg = key || "default";
  if (id.imdb) {
    return `${base}/${keySeg}/imdb/poster-default/${id.imdb}.jpg?fallback=true`;
  }
  if (id.tmdbId) {
    return `${base}/${keySeg}/tmdb/poster-default/${id.mediaType}-${id.tmdbId}.jpg?fallback=true`;
  }
  return undefined;
}

function betterPostersPath(base: string, id: ParsedId): string | undefined {
  if (!id.imdb) return undefined;
  return `${base}/poster/imdb/poster-default/${id.imdb}.jpg`;
}

export function rpdbPoster(key: string, metaId: string, fallback?: string): string | undefined {
  const id = parseMetaId(metaId);
  if (!id) return fallback;

  if (posterBase.includes("{")) {
    return fillTemplate(posterBase, id) ?? fallback;
  }

  if (!posterBase) {
    if (!key) return fallback;
    return rpdbPath("https://api.ratingposterdb.com", key, id) ?? fallback;
  }

  const host = posterBase.toLowerCase();
  if (host.includes("ratingposterdb.com")) {
    return rpdbPath(posterBase, key, id) ?? fallback;
  }
  if (host.includes("btttr.cc")) {
    return betterPostersPath(posterBase, id) ?? fallback;
  }
  if (host.includes("postersplus") || host.includes("elfhosted")) {
    return fallback;
  }

  if (key) return rpdbPath(posterBase, key, id) ?? fallback;
  return fallback;
}

export function needsImdbForPoster(key: string, metaId: string): boolean {
  if (rpdbPoster(key, metaId)) return false;
  if (!posterBase && !key) return false;
  return /^tmdb:(movie|tv):\d+$/.test(metaId);
}
