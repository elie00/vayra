import type { LibraryItem } from "@/lib/stremio";

export type LibraryStats = {
  total: number;
  watched: number;
  inProgress: number;
  movies: number;
  series: number;
  anime: number;
  completionRate: number; // 0..1
  estimatedHours: number;
  activeLast7: number;
  activeLast30: number;
  recent: Array<{ id: string; name: string; type: "movie" | "series"; when: number }>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isSeries(type: string): boolean {
  return type === "series" || type === "tv" || type === "channel";
}

function lastWatchedTs(i: LibraryItem): number {
  const a = Date.parse(i.state?.lastWatched ?? "");
  if (!Number.isNaN(a)) return a;
  const b = Date.parse(i._mtime ?? "");
  return Number.isNaN(b) ? 0 : b;
}

/**
 * Agrège les vraies données de la bibliothèque Stremio en statistiques honnêtes.
 * `now` est injecté pour rendre les fenêtres temporelles (7j/30j) testables.
 * Pas de genres ni d'année : ces champs n'existent pas sur LibraryItem (on ne
 * fabrique aucune métrique non calculable depuis les données réelles).
 */
export function computeLibraryStats(items: LibraryItem[], now: number): LibraryStats {
  const valid = items.filter((i) => !i.removed || i.temp);

  let watched = 0;
  let inProgress = 0;
  let movies = 0;
  let series = 0;
  let anime = 0;
  let estimatedSeconds = 0;
  let activeLast7 = 0;
  let activeLast30 = 0;

  const withTime: Array<{ item: LibraryItem; when: number }> = [];

  for (const i of valid) {
    const done = (i.state?.flaggedWatched ?? 0) > 0;
    const offset = i.state?.timeOffset ?? 0;
    const duration = i.state?.duration ?? 0;

    if (done) watched += 1;
    else if (offset > 0) inProgress += 1;

    if (isSeries(i.type)) series += 1;
    else movies += 1;
    if (i.isAnime) anime += 1;

    // Estimation du temps passé : durée complète si terminé, sinon position courante.
    estimatedSeconds += Math.max(0, done ? (duration > 0 ? duration : offset) : offset);

    const when = lastWatchedTs(i);
    if (when > 0) {
      withTime.push({ item: i, when });
      const age = now - when;
      if (age <= 7 * DAY_MS) activeLast7 += 1;
      if (age <= 30 * DAY_MS) activeLast30 += 1;
    }
  }

  const total = valid.length;
  const recent = withTime
    .sort((a, b) => b.when - a.when)
    .slice(0, 8)
    .map(({ item, when }) => ({
      id: item._id,
      name: item.name,
      type: (isSeries(item.type) ? "series" : "movie") as "movie" | "series",
      when,
    }));

  return {
    total,
    watched,
    inProgress,
    movies,
    series,
    anime,
    completionRate: total > 0 ? watched / total : 0,
    estimatedHours: Math.round((estimatedSeconds / 3600) * 10) / 10,
    activeLast7,
    activeLast30,
    recent,
  };
}
