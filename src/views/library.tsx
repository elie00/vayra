import { BarChart3, Bookmark, Clock, HardDrive } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import traktLogo from "@/assets/trakt.svg";
import anilistLogo from "@/assets/anilist.png";
import simklLogo from "@/assets/simkl.png";
import { useAnilist } from "@/lib/anilist/provider";
import { useSimkl } from "@/lib/simkl/provider";
import { useTrakt } from "@/lib/trakt/provider";
import { useScrollMemory, useView } from "@/lib/view";
import { useT } from "@/lib/i18n";
import { watchlistHas } from "@/lib/watchlist";
import { AnilistTab } from "./library/anilist-tab";
import { HistoryTab } from "./library/history-tab";
import { LocalTab } from "./library/local-tab";
import { TabBtn, type Tab } from "./library/shared";
import { SimklTab } from "./library/simkl-tab";
import { TraktTab } from "./library/trakt-tab";
import { WatchlistTab } from "./library/watchlist-tab";
import { pushActivityHint } from "@/lib/discord/activity-hint";

const LIBRARY_TAB_KEY = "harbor.library.tab";

function readSavedTab(): Tab {
  try {
    const v = localStorage.getItem(LIBRARY_TAB_KEY);
    if (
      v === "watchlist" ||
      v === "history" ||
      v === "local" ||
      v === "trakt" ||
      v === "anilist" ||
      v === "simkl"
    )
      return v;
  } catch {}
  return "watchlist";
}

export function LibraryView({ active }: { active: boolean }) {
  const [tab, setTab] = useState<Tab>(readSavedTab);
  const { isConnected: traktConnected } = useTrakt();
  const { isConnected: anilistConnected } = useAnilist();
  const { isConnected: simklConnected } = useSimkl();
  const scrollRef = useRef<HTMLElement>(null);
  useScrollMemory("library", scrollRef, active);

  useEffect(() => {
    try {
      localStorage.setItem(LIBRARY_TAB_KEY, tab);
    } catch {}
  }, [tab]);

  useEffect(() => {
    if (tab === "trakt" && !traktConnected) setTab("watchlist");
  }, [tab, traktConnected]);

  useEffect(() => {
    if (tab === "anilist" && !anilistConnected) setTab("watchlist");
  }, [tab, anilistConnected]);

  useEffect(() => {
    if (tab === "simkl" && !simklConnected) setTab("watchlist");
  }, [tab, simklConnected]);

  useEffect(() => {
    if (!active) return;
    const label =
      tab === "watchlist"
        ? "Browsing their watchlist"
        : tab === "history"
          ? "Browsing their watch history"
          : tab === "trakt"
            ? "Browsing their Trakt library"
            : tab === "simkl"
              ? "Browsing their Simkl library"
              : "Browsing their Stremio library";
    return pushActivityHint({ details: label, state: "Library" });
  }, [active, tab]);

  return (
    <main
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-5 pt-24 pb-14 sm:px-8 lg:px-12 lg:pt-28"
    >
      <div data-tauri-drag-region className="flex flex-col gap-7">
        <Header
          tab={tab}
          onTab={setTab}
          traktConnected={traktConnected}
          anilistConnected={anilistConnected}
          simklConnected={simklConnected}
        />
        {tab === "watchlist" && <WatchlistTab />}
        {tab === "history" && <HistoryTab />}
        {tab === "local" && <LocalTab />}
        {tab === "trakt" && traktConnected && <TraktTab />}
        {tab === "anilist" && anilistConnected && <AnilistTab />}
        {tab === "simkl" && simklConnected && <SimklTab />}
      </div>
    </main>
  );
}

function Header({
  tab,
  onTab,
  traktConnected,
  anilistConnected,
  simklConnected,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  traktConnected: boolean;
  anilistConnected: boolean;
  simklConnected: boolean;
}) {
  const t = useT();
  const { openStats } = useView();
  return (
    <header className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-ink-subtle">
            {t("My library")}
          </span>
          <h1 className="font-display text-[44px] font-medium leading-[1.05] text-ink">
            {t("Your collection.")}
          </h1>
          <p className="text-[14px] leading-snug text-ink-muted">
            {t("Watchlist is what you've saved for later. History is everything you've watched. Local is files on your computer.")}
          </p>
        </div>
        <button
          onClick={openStats}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-edge-soft/60 bg-elevated px-3.5 py-2 text-[12.5px] font-medium text-ink-muted transition-colors hover:border-edge hover:text-ink"
        >
          <BarChart3 size={14} strokeWidth={2.2} />
          {t("Stats")}
        </button>
      </div>
      <div className="flex items-center gap-1 border-b border-edge-soft">
        <TabBtn active={tab === "watchlist"} onClick={() => onTab("watchlist")}>
          <Bookmark size={14} strokeWidth={2.2} />
          {t("Watchlist")}
        </TabBtn>
        <TabBtn active={tab === "history"} onClick={() => onTab("history")}>
          <Clock size={14} strokeWidth={2.2} />
          {t("History")}
        </TabBtn>
        <TabBtn active={tab === "local"} onClick={() => onTab("local")}>
          <HardDrive size={14} strokeWidth={2.2} />
          {t("Local")}
        </TabBtn>
        {traktConnected && (
          <TabBtn active={tab === "trakt"} onClick={() => onTab("trakt")}>
            <img src={traktLogo} alt="" className="h-3.5 w-3.5 object-contain" />
            Trakt
          </TabBtn>
        )}
        {anilistConnected && (
          <TabBtn active={tab === "anilist"} onClick={() => onTab("anilist")}>
            <img src={anilistLogo} alt="" className="h-3.5 w-3.5 rounded-[3px] object-contain" />
            AniList
          </TabBtn>
        )}
        {simklConnected && (
          <TabBtn active={tab === "simkl"} onClick={() => onTab("simkl")}>
            <img src={simklLogo} alt="" className="h-3.5 w-3.5 object-contain" />
            Simkl
          </TabBtn>
        )}
      </div>
    </header>
  );
}

void watchlistHas;
