import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackToTop } from "@/components/back-to-top";
import { CatalogRows } from "@/components/catalog/catalog-rows";
import { CatalogCustomizeBar } from "@/components/catalog/customize-bar";
import { CinemaHero } from "@/components/cinema-hero";
import { Row, ScrollRootContext } from "@/components/row";
import { TopRankCard } from "@/components/top-rank-card";
import { TmdbNudge } from "@/components/nudge";
import { topMovies, type Meta } from "@/lib/cinemeta";
import { recentlyPlayed } from "@/lib/playback-history";
import { useT } from "@/lib/i18n";
import { listPager } from "@/lib/list-pager";
import { hasPageRowChanges, resetPageRows, usePageRows } from "@/lib/page-rows";
import { useSettings } from "@/lib/settings";
import { useScrollMemory, useView } from "@/lib/view";
import { buildMovieHero, HERO_POOL_TARGET, movieSpecs, rotateDaily } from "./movies/movie-specs";

const MAX_PER_ROW = 30;

type MovieRow = {
  key: string;
  title: string;
  metas: Meta[];
  page: number;
  hasMore: boolean;
  fetcher?: (page: number) => Promise<Meta[]>;
};

export function Movies({ active = true }: { active?: boolean }) {
  const { settings } = useSettings();
  const { openGrid } = useView();
  const t = useT();
  const pageRows = usePageRows("movies");
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
          <CatalogCustomizeBar
            editMode={pageRows.editMode}
            hasChanges={hasPageRowChanges(pageRows.custom)}
            onToggleEdit={() => pageRows.setEditMode((v) => !v)}
            onReset={() => pageRows.persist(resetPageRows())}
          />
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
          <CatalogRows
            rows={restRows}
            editMode={pageRows.editMode}
            custom={pageRows.custom}
            onPersist={pageRows.persist}
            scrollPrefix="movies"
            onLoadMore={loadMore}
            flagRerunKeys={["coming-soon"]}
          />
        </div>
        <BackToTop scrollRef={scrollRef} />
      </ScrollRootContext.Provider>
    </main>
  );
}
