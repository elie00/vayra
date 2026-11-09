import { useState } from "react";
import { Bookmark, MoreVertical, Play } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { useContinueWatching } from "@/lib/continue-watching";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import { removeFromWatchlist } from "@/lib/watchlist";
import type { WatchlistMerged } from "@/lib/watchlist-merge";
import { useWatchlistData } from "@/views/library/use-watchlist-data";

// The My list tab, after HBO Max: two tabs — the watchlist (saved on this
// device, Stremio and Trakt, merged) and Continue watching — each a list of
// landscape stills with the title, a year or an episode, and a menu.

type Tab = "list" | "resume";

export function MobileMyList() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("list");

  return (
    <main className="flex-1 overflow-y-auto px-4 pt-[calc(5rem+var(--harbor-status-bar,1.75rem))]">
      <h1 className="pt-1 text-center type-title-2 font-semibold text-ink">{t("My list")}</h1>
      <div role="tablist" className="relative mt-4 flex gap-6 border-b border-white/12">
        {(["list", "resume"] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`relative pb-3 pt-1 type-callout font-semibold transition-colors ${tab === id ? "text-ink" : "text-ink-subtle"}`}
          >
            {id === "list" ? t("My list") : t("Continue Watching")}
            {tab === id && <span aria-hidden className="absolute inset-x-0 -bottom-px h-[3px] rounded-t-full bg-ink" />}
          </button>
        ))}
      </div>
      <div className="pt-4">{tab === "list" ? <WatchlistRows /> : <ResumeRows />}</div>
    </main>
  );
}

function WatchlistRows() {
  const t = useT();
  const { openMeta } = useView();
  const { merged, handleRemove, authKey } = useWatchlistData();
  const [menuFor, setMenuFor] = useState<WatchlistMerged | null>(null);
  const items = [...merged].sort((a, b) => (b.date ?? 0) - (a.date ?? 0));

  if (items.length === 0) {
    return (
      <Empty icon={<Bookmark size={22} />} title={t("Nothing saved yet")}>
        {t("Tap + on a title to keep it here.")}
      </Empty>
    );
  }
  return (
    <>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <Row
            key={item.key}
            still={item.meta.background || item.meta.poster}
            title={item.meta.name}
            sub={item.meta.releaseInfo}
            onOpen={() => openMeta(item.meta)}
            onMenu={() => setMenuFor(item)}
            menuLabel={t("Options for {name}", { name: item.meta.name })}
          />
        ))}
      </ul>
      {menuFor && (
        <ActionSheet title={menuFor.meta.name} onClose={() => setMenuFor(null)}>
          <SheetAction
            onClick={() => {
              if (menuFor.stremioId && authKey) void handleRemove(menuFor.stremioId);
              else removeFromWatchlist(menuFor.meta.id);
              setMenuFor(null);
            }}
            danger
          >
            {t("Remove from my list")}
          </SheetAction>
        </ActionSheet>
      )}
    </>
  );
}

function ResumeRows() {
  const t = useT();
  const { openMeta } = useView();
  const cards = useContinueWatching(undefined, 40);
  if (cards.length === 0) {
    return (
      <Empty icon={<Play size={22} />} title={t("Nothing to resume")}>
        {t("Titles you start show up here.")}
      </Empty>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {cards.map((c) => {
        const meta: Meta = { id: c.id, type: c.type, name: c.name, poster: c.poster, background: c.background };
        const ep = c.season != null && c.episode != null ? { season: c.season, episode: c.episode } : undefined;
        return (
          <Row
            key={c.id}
            still={c.background || c.poster}
            title={c.name}
            sub={ep ? t("S{season} E{episode}", { season: ep.season, episode: ep.episode }) : undefined}
            progress={c.progress}
            onOpen={() => openMeta(meta, ep ? { episodeHint: ep } : undefined)}
          />
        );
      })}
    </ul>
  );
}

function Row({
  still,
  title,
  sub,
  progress,
  onOpen,
  onMenu,
  menuLabel,
}: {
  still?: string;
  title: string;
  sub?: string;
  progress?: number;
  onOpen: () => void;
  onMenu?: () => void;
  menuLabel?: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-start active:opacity-70">
        <span className="relative aspect-video w-[44%] shrink-0 overflow-hidden rounded-md bg-elevated">
          {still && <img src={downscale(still)} alt="" decoding="async" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
          {progress != null && progress > 0 && (
            <span className="absolute inset-x-0 bottom-0 h-[3px] bg-ink/20">
              <span className="block h-full bg-accent" style={{ width: `${Math.min(1, progress) * 100}%` }} />
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 type-callout font-semibold text-ink" dir="auto">{title}</span>
          {sub && <span className="type-footnote text-ink-subtle">{sub}</span>}
        </span>
      </button>
      {onMenu && (
        <button
          type="button"
          onClick={onMenu}
          aria-label={menuLabel}
          className="-me-2 flex h-11 w-9 shrink-0 items-center justify-center text-ink-muted active:text-ink"
        >
          <MoreVertical size={20} />
        </button>
      )}
    </li>
  );
}

function Empty({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 pt-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-elevated text-ink-muted">{icon}</span>
      <p className="type-callout font-semibold text-ink">{title}</p>
      <p className="type-footnote text-ink-muted">{children}</p>
    </div>
  );
}

function ActionSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-[130]">
      <button type="button" aria-label={t("common.close")} onClick={onClose} className="vayra-scrim absolute inset-0 bg-black/60" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="vayra-sheet absolute inset-x-0 bottom-0 flex flex-col gap-1 rounded-t-[1.75rem] bg-elevated px-4 pb-[calc(1rem+var(--vayra-safe-bottom))] pt-4"
      >
        <p className="truncate px-2 pb-2 type-footnote font-semibold text-ink-subtle">{title}</p>
        {children}
        <SheetAction onClick={onClose}>{t("Cancel")}</SheetAction>
      </section>
    </div>
  );
}

function SheetAction({ danger = false, onClick, children }: { danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 items-center rounded-xl px-3 text-start type-callout font-semibold active:bg-raised ${danger ? "text-danger" : "text-ink"}`}
    >
      {children}
    </button>
  );
}

function downscale(url: string): string {
  return url.replace(/\/t\/p\/(original|w1280|w780|w500)\//, "/t/p/w500/");
}
