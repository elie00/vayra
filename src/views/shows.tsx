import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackToTop } from "@/components/back-to-top";
import { ContinueCard } from "@/components/continue-card";
import { dismissCw, isCwDismissed, useCwDismissVersion } from "@/lib/cw-dismiss";
import { PeekHero } from "@/components/peek-hero";
import { PickCard } from "@/components/pick-card";
import { Row, ScrollRootContext } from "@/components/row";
import { TmdbNudge } from "@/components/nudge";
import { TopRankCard } from "@/components/top-rank-card";
import { useAuth } from "@/lib/auth";
import { topSeries, type Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { TV_GENRES } from "@/lib/feed/tags";
import { publishResumeStates } from "@/lib/hover-preview/store";
import { listPager } from "@/lib/list-pager";
import { tmdbDiscover, tmdbSeriesRow, tmdbTrending } from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { cwSortKey, isCwMember, library, type LibraryItem } from "@/lib/stremio";
import { useScrollMemory, useView } from "@/lib/view";
import { buildShowHero, bucketCopy } from "./shows/hero-curation";

const HERO_POOL_TARGET = 6;
const MAX_PER_ROW = 30;

type ShowRow = {
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

export function Shows({ active = true }: { active?: boolean }) {
  const { settings } = useSettings();
  const { authKey } = useAuth();
  const cwVersion = useCwDismissVersion();
  const { openGrid } = useView();
  const t = useT();
  const [hero, setHero] = useState<Meta[]>([]);
  const [rows, setRows] = useState<ShowRow[]>([]);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const rowsRef = useRef<ShowRow[]>([]);
  const loadingRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useScrollMemory("shows", scrollRef, active);

  const scrollCb = useCallback((el: HTMLElement | null) => {
    (scrollRef as { current: HTMLElement | null }).current = el;
    setScrollEl(el);
  }, []);

  useEffect(() => {
    if (!authKey) {
      setItems([]);
      return;
    }
    library(authKey).then(setItems).catch(() => {});
  }, [authKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (settings.tmdbKey) {
        const heroPool = await buildShowHero(settings.tmdbKey).catch(() => [] as Meta[]);
        if (cancelled) return;
        setHero(heroPool);
        const specs = showSpecs(settings.tmdbKey);
        const firstPages = await Promise.all(
          specs.map((s) => s.fetcher(1).catch(() => [] as Meta[])),
        );
        if (cancelled) return;
        const built: ShowRow[] = specs
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
          "Drama",
          "Comedy",
          "Crime",
          "Sci-Fi",
          "Thriller",
          "Mystery",
          "Action",
          "Animation",
          "Adventure",
          "Fantasy",
          "Documentary",
          "Romance",
          "Horror",
        ];
        const [top, ...byGenre] = await Promise.all([
          topSeries().catch(() => [] as Meta[]),
          ...genreList.map((g) => topSeries(g).catch(() => [] as Meta[])),
        ]);
        if (cancelled) return;
        setHero(top.filter((m) => m.background).slice(0, HERO_POOL_TARGET));
        const built: ShowRow[] = [
          {
            key: "cinemeta-top",
            title: "Top Series",
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
  }, [settings.tmdbKey]);

  const continueWatching = useMemo(
    () =>
      items
        .filter((i) => i.type === "series" && isCwMember(i) && !isCwDismissed(i))
        .map((i) => ({ i, k: cwSortKey(i) }))
        .sort((a, b) => b.k - a.k)
        .map((e) => e.i)
        .slice(0, 16),
    [items, cwVersion],
  );

  useEffect(() => {
    publishResumeStates(continueWatching);
  }, [continueWatching]);

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
    return rows
      .filter((r) => r.key !== "trending" || top10.length === 0)
      .map((r) => ({
        ...r,
        metas: r.metas.filter((m) => !seen.has(m.id)),
      }))
      .filter((r) => r.metas.length >= 4);
  }, [rows, hero, top10.length]);

  return (
    <main ref={scrollCb} className="relative h-full overflow-y-auto bg-canvas">
      <ScrollRootContext.Provider value={scrollEl}>
        <div className="relative mx-auto flex max-w-[1700px] flex-col gap-12 px-12 pb-32 pt-32">
          <PageMast />
          <PeekHero slides={hero} />
          {!settings.tmdbKey && <TmdbNudge />}
          {continueWatching.length > 0 && (
            <Row title={t("Pick up where you left off")} min={260} shape="landscape" scrollKey="shows:cw">
              {continueWatching.map((it) => (
                <ContinueCard key={it._id} item={it} onDismiss={(item) => dismissCw(item, authKey)} />
              ))}
            </Row>
          )}
          {top10.length >= 10 && (
            <Row
              title={t("Top 10 Series Today")}
              min={216}
              shape="rank"
              scrollKey="shows:top10"
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
              scrollKey={`shows:${row.key}`}
              onEndReached={row.hasMore ? () => loadMore(row.key) : undefined}
              onViewAll={
                row.fetcher
                  ? () => openGrid({ title: t(row.title), fetcher: row.fetcher!, initial: row.metas })
                  : undefined
              }
            >
              {row.metas.map((m) => (
                <PickCard key={m.id} meta={m} />
              ))}
            </Row>
          ))}
        </div>
        <BackToTop scrollRef={scrollRef} />
      </ScrollRootContext.Provider>
    </main>
  );
}

function PageMast() {
  const t = useT();
  const copy = bucketCopy();
  return (
    <header data-tauri-drag-region className="flex flex-col gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.42em] text-ink-subtle">
        {t(copy.kicker)}
      </span>
      <h1 className="font-display text-[44px] font-medium leading-[1.05] tracking-tight text-ink">
        {t(copy.title)}
      </h1>
      <p className="max-w-2xl text-[15px] leading-relaxed text-ink-muted">
        {t(copy.subtitle)}
      </p>
    </header>
  );
}

function showSpecs(key: string): RowSpec[] {
  return [
    {
      key: "trending",
      title: "Trending This Week",
      fetcher: (p) => tmdbTrending(key, "tv", "week", p),
    },
    {
      key: "on-the-air",
      title: "On Tonight",
      fetcher: (p) => tmdbSeriesRow(key, "on_the_air", p),
    },
    {
      key: "fresh",
      title: "Premiered This Month",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          "first_air_date.gte": isoDaysAgo(45),
          "first_air_date.lte": isoDaysAgo(0),
          "vote_count.gte": "20",
          sort_by: "popularity.desc",
          page: String(p),
        }),
    },
    {
      key: "net-hbo",
      title: "From HBO",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          with_networks: "49",
          "vote_count.gte": "200",
          sort_by: "popularity.desc",
          page: String(p),
        }),
    },
    {
      key: "net-netflix",
      title: "Netflix Originals",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          with_networks: "213",
          "vote_count.gte": "300",
          sort_by: "popularity.desc",
          page: String(p),
        }),
    },
    {
      key: "net-apple",
      title: "Apple TV+",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          with_networks: "2552",
          "vote_count.gte": "100",
          sort_by: "popularity.desc",
          page: String(p),
        }),
    },
    {
      key: "net-amc",
      title: "AMC",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          with_networks: "174",
          "vote_count.gte": "200",
          sort_by: "popularity.desc",
          page: String(p),
        }),
    },
    {
      key: "net-fx",
      title: "FX",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          with_networks: "88",
          "vote_count.gte": "200",
          sort_by: "popularity.desc",
          page: String(p),
        }),
    },
    {
      key: "net-disney",
      title: "Disney+ Originals",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          with_networks: "2739",
          "vote_count.gte": "100",
          sort_by: "popularity.desc",
          page: String(p),
        }),
    },
    {
      key: "net-amazon",
      title: "Prime Video",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          with_networks: "1024",
          "vote_count.gte": "200",
          sort_by: "popularity.desc",
          page: String(p),
        }),
    },
    {
      key: "limited",
      title: "Limited Series & Miniseries",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          with_type: "2",
          "vote_average.gte": "7.5",
          "vote_count.gte": "300",
          sort_by: "vote_count.desc",
          page: String(p),
        }),
    },
    {
      key: "prestige-drama",
      title: "Prestige Drama",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          with_genres: String(TV_GENRES.Drama),
          "vote_average.gte": "8.0",
          "vote_count.gte": "1000",
          sort_by: "vote_average.desc",
          page: String(p),
        }),
    },
    {
      key: "comedy",
      title: "Comedy Series",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          with_genres: String(TV_GENRES.Comedy),
          "vote_average.gte": "7.6",
          "vote_count.gte": "500",
          sort_by: "popularity.desc",
          page: String(p),
        }),
    },
    {
      key: "crime",
      title: "Crime & Mystery",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          with_genres: String(TV_GENRES.Crime),
          "vote_average.gte": "7.5",
          "vote_count.gte": "500",
          sort_by: "vote_average.desc",
          page: String(p),
        }),
    },
    {
      key: "scifi",
      title: "Sci-Fi & Fantasy",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          with_genres: String(TV_GENRES["Sci-Fi & Fantasy"]),
          "vote_average.gte": "7.5",
          "vote_count.gte": "500",
          sort_by: "popularity.desc",
          page: String(p),
        }),
    },
    {
      key: "doc-series",
      title: "Documentary Series",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          with_genres: String(TV_GENRES.Documentary),
          "vote_average.gte": "7.5",
          "vote_count.gte": "100",
          sort_by: "vote_average.desc",
          page: String(p),
        }),
    },
    {
      key: "all-time",
      title: "All-Time Great Series",
      fetcher: (p) => tmdbSeriesRow(key, "top_rated", p),
    },
    {
      key: "long-runners",
      title: "Iconic Long-Runners",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          "vote_average.gte": "7.8",
          "vote_count.gte": "500",
          "first_air_date.lte": "2010-12-31",
          sort_by: "vote_count.desc",
          page: String(p),
        }),
    },
    {
      key: "kdrama",
      title: "K-Drama",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          with_origin_country: "KR",
          "vote_average.gte": "7.5",
          "vote_count.gte": "100",
          sort_by: "popularity.desc",
          page: String(p),
        }),
    },
    {
      key: "british",
      title: "British Television",
      fetcher: (p) =>
        tmdbDiscover(key, "tv", {
          with_origin_country: "GB",
          "vote_average.gte": "7.5",
          "vote_count.gte": "300",
          sort_by: "vote_average.desc",
          page: String(p),
        }),
    },
  ];
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
