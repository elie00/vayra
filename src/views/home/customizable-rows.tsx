import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { LazyMount } from "@/components/lazy-mount";
import { PickCard } from "@/components/pick-card";
import { Row } from "@/components/row";
import { CustomSourcesRow } from "@/components/custom-sources-row";
import { TopRankCard } from "@/components/top-rank-card";
import { useT } from "@/lib/i18n";
import type { HomeRowCustomization } from "@/lib/home-customization";
import { useView } from "@/lib/view";
import type { HomeRow } from "./home-types";
import { RowControls } from "./row-controls";
import { watchTitleKey, type WatchedSet } from "@/lib/playback-history";

function metaTitleKey(meta: { id?: string }): string | null {
  const id = meta.id;
  if (!id) return null;
  if (/^tt\d+$/.test(id)) return `imdb:${id}`;
  if (id.startsWith("tmdb:")) {
    const num = Number(id.split(":")[2]);
    if (Number.isFinite(num)) return `tmdb:${num}`;
  }
  return null;
}

function RowTitle({ row }: { row: HomeRow }) {
  const t = useT();
  const { openGrid } = useView();
  if (!row.fetcher) return <>{t(row.name)}</>;
  return (
    <button
      onClick={() =>
        openGrid({ title: t(row.name), fetcher: row.fetcher!, initial: row.metas })
      }
      className="group/see inline-flex items-center gap-1.5 text-ink transition-colors hover:text-ink-muted"
    >
      {t(row.name)}
      <span className="inline-flex items-center gap-0.5 text-[12px] font-medium text-ink-subtle opacity-0 transition-opacity duration-200 group-hover/see:opacity-100">
        {t("See all")}
        <ChevronRight size={14} strokeWidth={2.4} className="dir-icon" />
      </span>
    </button>
  );
}

export function CustomizableRows({
  rows,
  editMode,
  customization,
  orderKeys,
  onMove,
  onToggleHidden,
  onRename,
  onToggleNumerals,
  onToggleHero,
  onLoadMore,
  onDeleteCustomSource,
  onEditFolderImages,
  hideWatched,
  watchedSet,
  localWatched,
  homeLanguages,
}: {
  rows: HomeRow[];
  editMode: boolean;
  customization: HomeRowCustomization;
  orderKeys: string[];
  onMove: (key: string, delta: -1 | 1) => void;
  onToggleHidden: (key: string) => void;
  onRename: (key: string, label: string) => void;
  onToggleNumerals: (key: string) => void;
  onToggleHero?: (key: string) => void;
  onLoadMore: (key: string) => void;
  onDeleteCustomSource?: (key: string) => void;
  onEditFolderImages?: (sourceId: string, folderId: string, cover: string, gif: string) => void;
  hideWatched?: boolean;
  watchedSet?: Set<string>;
  localWatched?: WatchedSet;
  homeLanguages?: string[];
}) {
  const { openGrid } = useView();
  const t = useT();
  const watchedTitleKeys = useMemo(() => {
    const out = new Set<string>();
    if (!watchedSet) return out;
    for (const k of watchedSet) {
      const parts = k.split(":");
      if (parts.length >= 2) out.add(`${parts[0]}:${parts[1]}`);
    }
    return out;
  }, [watchedSet]);
  const isWatched = (m: { id: string; name?: string }) => {
    const key = metaTitleKey(m);
    if (key != null && watchedTitleKeys.has(key)) return true;
    if (localWatched) {
      if (localWatched.ids.has(m.id)) return true;
      const tk = watchTitleKey(m.name);
      if (tk && localWatched.titles.has(tk)) return true;
    }
    return false;
  };
  return (
    <>
      {rows.map((row, rowIndex) => {
        const hidden = customization.hidden.includes(row.key);
        if (hidden && !editMode) return null;
        let metas = row.metas.filter((m) => typeof m.id === "string");
        if (homeLanguages && homeLanguages.length > 0) {
          metas = metas.filter((m) => !m.originalLanguage || homeLanguages.includes(m.originalLanguage));
        }
        if (hideWatched) metas = metas.filter((m) => !isWatched(m));
        if (
          (hideWatched || (homeLanguages && homeLanguages.length > 0)) &&
          metas.length === 0 &&
          !editMode &&
          !row.sourceRow
        )
          return null;
        const idx = orderKeys.indexOf(row.key);
        const eager = rowIndex < 2;
        const viewAll = row.fetcher
          ? () => openGrid({ title: t(row.name), fetcher: row.fetcher!, initial: row.metas })
          : undefined;
        const ranked =
          (customization.numerals ?? []).includes(row.key) && metas.length >= 10;
        let rowEl;
        if (row.sourceRow) {
          rowEl = <CustomSourcesRow sourceRow={row.sourceRow} editMode={editMode} onEditFolderImages={onEditFolderImages} />;
        } else if (ranked) {
          rowEl = (
            <Row
              title={<RowTitle row={row} />}
              min={180}
              shape="rank"
              scrollKey={`home:${row.key}`}
              onViewAll={viewAll}
            >
              {metas.slice(0, 10).map((m, i) => (
                <TopRankCard key={m.id} meta={m} rank={i + 1} />
              ))}
            </Row>
          );
        } else {
          rowEl = (
            <Row
              title={<RowTitle row={row} />}
              scrollKey={`home:${row.key}`}
              onEndReached={row.hasMore ? () => onLoadMore(row.key) : undefined}
              onViewAll={viewAll}
            >
              {metas.map((m, i) => (
                <PickCard key={`${m.id}-${i}`} meta={m} />
              ))}
            </Row>
          );
        }
        return (
          <div
            key={row.key}
            data-scroll-anchor={`row:${row.key}`}
          >
            {editMode && (
              <RowControls
                name={row.name}
                hidden={hidden}
                canMoveUp={idx > 0}
                canMoveDown={idx >= 0 && idx < orderKeys.length - 1}
                onMoveUp={() => onMove(row.key, -1)}
                onMoveDown={() => onMove(row.key, 1)}
                onToggleHidden={() => onToggleHidden(row.key)}
                onRename={(label) => onRename(row.key, label)}
                onResetName={() => onRename(row.key, "")}
                isRenamed={row.key in customization.renamed}
                numeralsActive={(customization.numerals ?? []).includes(row.key)}
                canNumerals={row.metas.length >= 10}
                onToggleNumerals={() => onToggleNumerals(row.key)}
                heroActive={customization.heroSource === row.key}
                canHero={row.metas.some((m) => m.background || m.poster)}
                onToggleHero={() => onToggleHero?.(row.key)}
                onDelete={row.sourceRow ? () => onDeleteCustomSource?.(row.key) : undefined}
              />
            )}
            {!hidden && (eager ? rowEl : <LazyMount minHeight={340}>{rowEl}</LazyMount>)}
          </div>
        );
      })}
    </>
  );
}
