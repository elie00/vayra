import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackToTop } from "@/components/back-to-top";
import { CinemaHero } from "@/components/cinema-hero";
import { PickCard } from "@/components/pick-card";
import { Row, ScrollRootContext } from "@/components/row";
import { TopRankCard } from "@/components/top-rank-card";
import { TmdbNudge } from "@/components/nudge";
import { topMovies, type Meta } from "@/lib/cinemeta";
import { recentlyPlayed, watchTitleKey } from "@/lib/playback-history";
import { useT } from "@/lib/i18n";
import { fetchUnderNinety } from "@/lib/feed/sections";
import { pickMoodSpecs } from "@/lib/feed/moods";
import { MOVIE_GENRES } from "@/lib/feed/tags";
import { listPager } from "@/lib/list-pager";
import { tmdbDiscover, tmdbMovieRow, tmdbTrending } from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { useScrollMemory, useView } from "@/lib/view";

const HERO_POOL_TARGET = 5;
const MAX_PER_ROW = 30;

type MovieRow = {
  key: string;
  title: string;
  metas: Meta[];
  page: number;
  hasMore: boolean;
  fetcher?: (page: number) => Promise<Meta[]>;
};

type RowSpec = {
  key: string;
  title: string;
  fetcher: (page: number) => Promise<Meta[]>;
  noPaginate?: boolean;
};

export function Movies({ active = true }: { active?: boolean }) {
  const { settings } = useSettings();
  const { openGrid } = useView();
  const t = useT();
  const [hero, setHero] = useState<Meta[]>([]);
  const [rows, setRows] = useState<MovieRow[]>([]);
  const rowsRef = useRef<MovieRow[]>([]);
  const loadingRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useScrollMemory("movies", scrollRef, active);

  const scrollCb = useCallback((el: HTMLElement | null) => {
    (scrollRef as { current: HTMLElement | null }).current = el;
    setScrollEl(el);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const seen = recentlyPlayed();
      if (settings.tmdbKey) {
        const heroPool = await buildMovieHero(settings.tmdbKey, seen).catch(() => [] as Meta[]);
        if (cancelled) return;
        setHero(heroPool);
        const specs = movieSpecs(settings.tmdbKey, settings.region);
        const firstPages = await Promise.all(
          specs.map((s) => s.fetcher(1).catch(() => [] as Meta[])),
        );
        if (cancelled) return;
        const built: MovieRow[] = specs
          .map((spec, i) => ({
            key: spec.key,
            title: spec.title,
            metas: firstPages[i],
            page: 1,
            hasMore: !spec.noPaginate && firstPages[i].length >= 14,
            fetcher: spec.noPaginate ? undefined : spec.fetcher,
          }))
          .filter((r) => r.metas.length > 0);
        setRows(built);
      } else {
        const genreList = [
          "Action",
          "Drama",
          "Comedy",
          "Sci-Fi",
          "Thriller",
          "Horror",
          "Romance",
          "Animation",
          "Adventure",
          "Crime",
          "Mystery",
          "Fantasy",
          "Documentary",
        ];
        const [top, ...byGenre] = await Promise.all([
          topMovies().catch(() => [] as Meta[]),
          ...genreList.map((g) => topMovies(g).catch(() => [] as Meta[])),
        ]);
        if (cancelled) return;
        setHero(rotateDaily(top.filter((m) => m.background), HERO_POOL_TARGET, seen));
        const built: MovieRow[] = [
          {
            key: "cinemeta-top",
            title: "Top Movies",
            metas: top.slice(0, 30),
            page: 1,
            hasMore: false,
            fetcher: listPager(top),
          },
        ];
        for (let i = 0; i < genreList.length; i++) {
          const list = byGenre[i] ?? [];
          if (list.length === 0) continue;
          built.push({
            key: `cinemeta-genre-${genreList[i].toLowerCase().replace(/[^a-z]/g, "")}`,
            title: `Top ${genreList[i]}`,
            metas: list.slice(0, 30),
            page: 1,
            hasMore: false,
            fetcher: listPager(list),
          });
        }
        setRows(built);
      }
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [settings.tmdbKey, settings.region]);

  const loadMore = useCallback((rowKey: string) => {
    if (loadingRef.current.has(rowKey)) return;
    const row = rowsRef.current.find((r) => r.key === rowKey);
    if (!row || !row.fetcher || !row.hasMore || row.metas.length >= MAX_PER_ROW) return;
    loadingRef.current.add(rowKey);
    const next = row.page + 1;
    row
      .fetcher(next)
      .then((more) => {
        setRows((rs) =>
          rs.map((r) => {
            if (r.key !== rowKey) return r;
            const ids = new Set(r.metas.map((m) => m.id));
            const fresh = more.filter((m) => !ids.has(m.id));
            const combined = [...r.metas, ...fresh];
            const reachedCap = combined.length >= MAX_PER_ROW;
            return {
              ...r,
              metas: reachedCap ? combined.slice(0, MAX_PER_ROW) : combined,
              page: next,
              hasMore: !reachedCap && more.length > 0,
            };
          }),
        );
      })
      .catch(() => {})
      .finally(() => {
        loadingRef.current.delete(rowKey);
      });
  }, []);

  const top10 = useMemo(() => {
    const trending = rows.find((r) => r.key === "trending");
    if (!trending) return [] as Meta[];
    return trending.metas.slice(0, 10);
  }, [rows]);

  const restRows = useMemo(() => {
    const seen = new Set<string>();
    for (const m of hero) seen.add(m.id);
    if (top10.length > 0) {
      for (const m of top10) seen.add(m.id);
    }
    return rows
      .filter((r) => r.key !== "trending" || top10.length === 0)
      .map((r) => {
        const dedupedMetas = r.metas.filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
        return { ...r, metas: dedupedMetas };
      })
      .filter((r) => r.metas.length >= 4);
  }, [rows, hero, top10]);

  return (
    <main ref={scrollCb} className="relative h-full overflow-y-auto bg-canvas">
      <ScrollRootContext.Provider value={scrollEl}>
        <CinemaHero slides={hero} eyebrow={t("Featured tonight")} />
        <div className="relative flex w-full flex-col gap-12 px-12 pb-32 pt-12">
          {!settings.tmdbKey && <TmdbNudge />}
          {top10.length >= 10 && (
            <Row
              title={t("Top 10 Movies Today")}
              min={216}
              shape="rank"
              scrollKey="movies:top10"
              onViewAll={(() => {
                const trending = rows.find((r) => r.key === "trending");
                return trending?.fetcher
                  ? () =>
                      openGrid({
                        title: t(trending.title),
                        fetcher: trending.fetcher!,
                        initial: trending.metas,
                      })
                  : undefined;
              })()}
            >
              {top10.slice(0, 10).map((m, i) => (
                <TopRankCard key={m.id} meta={m} rank={i + 1} />
              ))}
            </Row>
          )}
          {restRows.map((row) => (
            <Row
              key={row.key}
              title={t(row.title)}
              min={148}
              shape="portrait"
              scrollKey={`movies:${row.key}`}
              onEndReached={row.hasMore ? () => loadMore(row.key) : undefined}
              onViewAll={
                row.fetcher
                  ? () => openGrid({ title: t(row.title), fetcher: row.fetcher!, initial: row.metas })
                  : undefined
              }
            >
              {row.metas.map((m) => (
                <PickCard key={m.id} meta={m} flagRerun={row.key === "coming-soon"} />
              ))}
            </Row>
          ))}
        </div>
        <BackToTop scrollRef={scrollRef} />
      </ScrollRootContext.Provider>
    </main>
  );
}

async function buildMovieHero(key: string, seen: ReturnType<typeof recentlyPlayed>): Promise<Meta[]> {
  const [topA, topB, prestigeA, prestigeB, modern] = await Promise.all([
    tmdbMovieRow(key, "top_rated", "US", 1).catch(() => [] as Meta[]),
    tmdbMovieRow(key, "top_rated", "US", 2).catch(() => [] as Meta[]),
    tmdbDiscover(key, "movie", {
      "vote_average.gte": "8.0",
      "vote_count.gte": "4000",
      sort_by: "vote_average.desc",
      page: "1",
    }).catch(() => [] as Meta[]),
    tmdbDiscover(key, "movie", {
      "vote_average.gte": "8.0",
      "vote_count.gte": "4000",
      sort_by: "vote_average.desc",
      page: "2",
    }).catch(() => [] as Meta[]),
    tmdbDiscover(key, "movie", {
      "primary_release_date.gte": "2016-01-01",
      "vote_average.gte": "7.8",
      "vote_count.gte": "2500",
      sort_by: "vote_average.desc",
      page: "1",
    }).catch(() => [] as Meta[]),
  ]);
  const pool: Meta[] = [];
  const ids = new Set<string>();
  for (const list of [prestigeA, topA, modern, prestigeB, topB]) {
    for (const m of list) {
      if (!m.background || ids.has(m.id)) continue;
      ids.add(m.id);
      pool.push(m);
    }
  }
  return rotateDaily(pool, HERO_POOL_TARGET, seen);
}

function rotateDaily<T extends { id: string; name: string }>(
  pool: T[],
  n: number,
  seen: ReturnType<typeof recentlyPlayed>,
): T[] {
  const unseen = pool.filter(
    (m) => !seen.ids.has(m.id) && !seen.titles.has(watchTitleKey(m.name)),
  );
  const base = unseen.length >= n ? unseen : pool;
  if (base.length === 0) return [];
  const day = Math.floor(Date.now() / 86_400_000);
  const out: T[] = [];
  const used = new Set<number>();
  while (out.length < n && used.size < base.length) {
    let j = (day * 13 + out.length * 17) % base.length;
    while (used.has(j)) j = (j + 1) % base.length;
    used.add(j);
    out.push(base[j]);
  }
  return out;
}

function movieSpecs(key: string, region: string): RowSpec[] {
  return [
    {
      key: "trending",
      title: "Trending This Week",
      fetcher: (p) => tmdbTrending(key, "movie", "week", p),
    },
    {
      key: "in-theaters",
      title: "In Theaters Now",
      fetcher: (p) => tmdbMovieRow(key, "now_playing", region, p),
    },
    ...pickMoodSpecs(new Date()).map((m): RowSpec => ({
      key: m.id,
      title: m.title,
      fetcher: (p) => tmdbDiscover(key, "movie", { ...m.params, page: String(p) }),
    })),
    {
      key: "critics-acclaim",
      title: "Critics' Picks",
      fetcher: (p) =>
        tmdbDiscover(key, "movie", {
          "primary_release_date.gte": "2015-01-01",
          "vote_average.gte": "7.6",
          "vote_count.gte": "2500",
          sort_by: "vote_average.desc",
          page: String(p),
        }),
    },
    {
      key: "all-time-greats",
      title: "All-Time Greats",
      fetcher: (p) => tmdbMovieRow(key, "top_rated", region, p),
    },
    {
      key: "hidden-gems",
      title: "Hidden Gems",
      fetcher: (p) =>
        tmdbDiscover(key, "movie", {
          "vote_average.gte": "7.6",
          "vote_count.gte": "200",
          "vote_count.lte": "1500",
          sort_by: "vote_average.desc",
          page: String(p),
        }),
    },
    {
      key: "under-90",
      title: "Quick Watches Under 90",
      fetcher: (p) => fetchUnderNinety(key, p),
    },
    {
      key: "coming-soon",
      title: "Coming to Theaters",
      fetcher: (p) => tmdbMovieRow(key, "upcoming", region, p),
    },
    {
      key: "decade-2010",
      title: "Defining the 2010s",
      fetcher: (p) =>
        tmdbDiscover(key, "movie", {
          "primary_release_date.gte": "2010-01-01",
          "primary_release_date.lte": "2019-12-31",
          "vote_average.gte": "7.6",
          "vote_count.gte": "2000",
          sort_by: "vote_count.desc",
          page: String(p),
        }),
    },
    {
      key: "decade-90",
      title: "Essential 90s",
      fetcher: (p) =>
        tmdbDiscover(key, "movie", {
          "primary_release_date.gte": "1990-01-01",
          "primary_release_date.lte": "1999-12-31",
          "vote_average.gte": "7.6",
          "vote_count.gte": "1000",
          sort_by: "popularity.desc",
          page: String(p),
        }),
    },
    {
      key: "decade-80",
      title: "80s Classics",
      fetcher: (p) =>
        tmdbDiscover(key, "movie", {
          "primary_release_date.gte": "1980-01-01",
          "primary_release_date.lte": "1989-12-31",
          "vote_average.gte": "7.4",
          "vote_count.gte": "500",
          sort_by: "popularity.desc",
          page: String(p),
        }),
    },
    {
      key: "decade-70",
      title: "70s Auteurs",
      fetcher: (p) =>
        tmdbDiscover(key, "movie", {
          "primary_release_date.gte": "1970-01-01",
          "primary_release_date.lte": "1979-12-31",
          "vote_average.gte": "7.4",
          "vote_count.gte": "300",
          sort_by: "vote_average.desc",
          page: String(p),
        }),
    },
    {
      key: "lang-jp",
      title: "Japanese Cinema",
      fetcher: (p) =>
        tmdbDiscover(key, "movie", {
          with_original_language: "ja",
          "vote_average.gte": "7.5",
          "vote_count.gte": "200",
          sort_by: "vote_average.desc",
          page: String(p),
        }),
    },
    {
      key: "lang-kr",
      title: "Korean Cinema",
      fetcher: (p) =>
        tmdbDiscover(key, "movie", {
          with_original_language: "ko",
          "vote_average.gte": "7.5",
          "vote_count.gte": "200",
          sort_by: "vote_average.desc",
          page: String(p),
        }),
    },
    {
      key: "lang-fr",
      title: "French Cinema",
      fetcher: (p) =>
        tmdbDiscover(key, "movie", {
          with_original_language: "fr",
          "vote_average.gte": "7.3",
          "vote_count.gte": "200",
          sort_by: "vote_average.desc",
          page: String(p),
        }),
    },
    {
      key: "doc",
      title: "Documentary Spotlight",
      fetcher: (p) =>
        tmdbDiscover(key, "movie", {
          with_genres: String(MOVIE_GENRES.Documentary),
          "vote_average.gte": "7.5",
          "vote_count.gte": "200",
          sort_by: "vote_average.desc",
          page: String(p),
        }),
    },
  ];
}
