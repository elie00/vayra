import { ArrowUpRight, BarChart3, Bookmark, Clock, Download, HardDrive, Layers } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import traktLogo from "@/assets/trakt.svg";
import anilistLogo from "@/assets/anilist.png";
import simklLogo from "@/assets/simkl.png";
import malLogo from "@/assets/mal.png";
import letterboxdLogo from "@/assets/addon-logos/letterboxd.png";
import { useAnilist } from "@/lib/anilist/provider";
import { useActiveDownloadCount, useDownloads } from "@/lib/download/downloads-store";
import { useSimkl } from "@/lib/simkl/provider";
import { useMal } from "@/lib/mal/provider";
import { useLetterboxd } from "@/lib/stremboxd/provider";
import { useTrakt } from "@/lib/trakt/provider";
import { useScrollMemory, useView } from "@/lib/view";
import { useT } from "@/lib/i18n";
import { watchlistHas } from "@/lib/watchlist";
import { TabBtn, type Tab } from "./library/shared";
import { pushActivityHint } from "@/lib/discord/activity-hint";
import { currentPlatformCapabilities } from "@/lib/platform-capabilities";
import { tabAvailable } from "./library/tab-availability";
import { hasNativeDesktopUx, isMobileTauri } from "@/lib/platform";

const AnilistTab = lazy(() => import("./library/anilist-tab").then((m) => ({ default: m.AnilistTab })));
const DownloadsView = lazy(() => import("./downloads").then((m) => ({ default: m.DownloadsView })));
const HistoryTab = lazy(() => import("./library/history-tab").then((m) => ({ default: m.HistoryTab })));
const LocalTab = lazy(() => import("./library/local-tab").then((m) => ({ default: m.LocalTab })));
const SimklTab = lazy(() => import("./library/simkl-tab").then((m) => ({ default: m.SimklTab })));
const MalTab = lazy(() => import("./library/mal-tab").then((m) => ({ default: m.MalTab })));
const MyListsTab = lazy(() => import("./library/my-lists-tab").then((m) => ({ default: m.MyListsTab })));
const LetterboxdTab = lazy(() => import("./library/letterboxd-tab").then((m) => ({ default: m.LetterboxdTab })));
const TraktTab = lazy(() => import("./library/trakt-tab").then((m) => ({ default: m.TraktTab })));
const WatchlistTab = lazy(() => import("./library/watchlist-tab").then((m) => ({ default: m.WatchlistTab })));
const MobileMyList = lazy(() => import("@/mobile/my-list").then((m) => ({ default: m.MobileMyList })));

const LIBRARY_TAB_KEY = "harbor.library.tab";

function readSavedTab(capabilities: ReturnType<typeof currentPlatformCapabilities>, unified: boolean): Tab {
  try {
    const v = localStorage.getItem(LIBRARY_TAB_KEY);
    if (
      v === "watchlist" ||
      (v === "downloads" && !unified && tabAvailable("downloads", capabilities)) ||
      v === "history" ||
      (v === "local" && tabAvailable("local", capabilities)) ||
      v === "trakt" ||
      v === "anilist" ||
      v === "simkl" ||
      v === "mal" ||
      v === "lists" ||
      v === "letterboxd"
    )
      return v;
  } catch {}
  return "watchlist";
}

/** On a phone, the My list tab (watchlist and Continue watching); elsewhere, the full library. */
export function LibraryView({ active }: { active: boolean }) {
  return isMobileTauri() ? (
    <Suspense fallback={null}>
      <MobileMyList />
    </Suspense>
  ) : (
    <DesktopLibraryView active={active} />
  );
}

function DesktopLibraryView({ active }: { active: boolean }) {
  const capabilities = currentPlatformCapabilities();
  const { view, setView } = useView();
  // On Mac and Windows, Downloads lives inside My library: its tab is shown
  // exactly when the view is "downloads", so the sidebar's Downloads sub-link
  // always agrees with the tab, and `savedTab` is the last other tab, the one
  // My library opens on. Elsewhere Downloads has its own page and the tab is
  // just local state.
  const unified = hasNativeDesktopUx();
  const [savedTab, setTab] = useState<Tab>(() => readSavedTab(capabilities, unified));
  const tab: Tab =
    unified && view === "downloads" && tabAvailable("downloads", capabilities) ? "downloads" : savedTab;
  const { isConnected: traktConnected } = useTrakt();
  const { isConnected: anilistConnected } = useAnilist();
  const { isConnected: simklConnected } = useSimkl();
  const { isConnected: malConnected } = useMal();
  const lb = useLetterboxd();
  const scrollRef = useRef<HTMLElement>(null);
  useScrollMemory("library", scrollRef, active);

  const selectTab = useCallback(
    (next: Tab) => {
      if (unified && next === "downloads") {
        if (view !== "downloads") setView("downloads");
        return;
      }
      setTab(next);
      if (unified && view === "downloads") setView("library");
    },
    [unified, view, setView],
  );

  useEffect(() => {
    try {
      localStorage.setItem(LIBRARY_TAB_KEY, savedTab);
    } catch {}
  }, [savedTab]);

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
    if (tab === "mal" && !malConnected) setTab("watchlist");
  }, [tab, malConnected]);

  useEffect(() => {
    if (tab === "letterboxd" && !lb.isActive) setTab("watchlist");
  }, [tab, lb.isActive]);

  useEffect(() => {
    if (!active) return;
    const label =
      tab === "watchlist"
        ? "Browsing their watchlist"
        : tab === "history"
          ? "Browsing their watch history"
          : tab === "downloads"
            ? "Managing their downloads"
            : tab === "trakt"
              ? "Browsing their Trakt library"
              : tab === "simkl"
                ? "Browsing their Simkl library"
                : tab === "mal"
                  ? "Browsing their MyAnimeList library"
                  : tab === "lists"
                    ? "Browsing their lists"
                    : tab === "letterboxd"
                      ? "Browsing their Letterboxd library"
                      : "Browsing their Stremio library";
    return pushActivityHint({ details: label, state: "Library" });
  }, [active, tab]);

  return (
    <main
      ref={scrollRef}
      className={`flex-1 overflow-y-auto px-5 pb-14 sm:px-8 lg:px-12 max-sm:pt-[calc(5rem+var(--harbor-status-bar,1.75rem))] ${
        hasNativeDesktopUx() ? "pt-16 lg:pt-20" : "pt-24 lg:pt-28"
      }`}
    >
      <div data-tauri-drag-region className="flex flex-col gap-6">
        <Header
          tab={tab}
          onTab={selectTab}
          traktConnected={traktConnected}
          anilistConnected={anilistConnected}
          simklConnected={simklConnected}
          malConnected={malConnected}
          letterboxdActive={lb.isActive}
        />
        <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface/60" aria-hidden="true" />}>
          {tab === "watchlist" && <WatchlistTab />}
          {tab === "history" && <HistoryTab />}
          {tab === "downloads" && tabAvailable("downloads", capabilities) && <DownloadsView embedded />}
          {tab === "local" && tabAvailable("local", capabilities) && <LocalTab />}
          {tab === "trakt" && traktConnected && <TraktTab />}
          {tab === "anilist" && anilistConnected && <AnilistTab />}
          {tab === "simkl" && simklConnected && <SimklTab />}
          {tab === "mal" && malConnected && <MalTab />}
          {tab === "lists" && <MyListsTab />}
          {tab === "letterboxd" && lb.isActive && <LetterboxdTab />}
        </Suspense>
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
  malConnected,
  letterboxdActive,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  traktConnected: boolean;
  anilistConnected: boolean;
  simklConnected: boolean;
  malConnected: boolean;
  letterboxdActive: boolean;
}) {
  const t = useT();
  const { openStats } = useView();
  const downloads = useDownloads();
  const activeDownloads = useActiveDownloadCount();
  const capabilities = currentPlatformCapabilities();
  const hasDownloadsTab = tabAvailable("downloads", capabilities);
  const hasExternalTabs =
    traktConnected || anilistConnected || simklConnected || malConnected || letterboxdActive;

  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="vayra-kicker">{t("My library")}</span>
          <h1 className="mac-page-title">{t("Your collection.")}</h1>
          <p className="max-w-[64ch] text-[14px] leading-relaxed text-ink-muted">
            {hasDownloadsTab
              ? t("Watchlist, history, offline downloads, and local files — all in one place.")
              : t("Watchlist is what you've saved for later. History is everything you've watched. Local is files on your computer.")}
          </p>
        </div>
        <button
          type="button"
          onClick={openStats}
          className="mac-secondary-button shrink-0"
        >
          <BarChart3 size={14} strokeWidth={2.1} />
          <span>{t("Stats")}</span>
          <ArrowUpRight size={13} strokeWidth={2} className="text-ink-subtle" />
        </button>
      </div>
      <div
        role="tablist"
        aria-label={t("My library")}
        className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="vayra-pill-track shrink-0">
          <TabBtn active={tab === "watchlist"} onClick={() => onTab("watchlist")}>
            <Bookmark size={14} strokeWidth={2.1} />
            {t("Watchlist")}
          </TabBtn>
          <TabBtn active={tab === "history"} onClick={() => onTab("history")}>
            <Clock size={14} strokeWidth={2.1} />
            {t("History")}
          </TabBtn>
          {hasDownloadsTab && (
            <TabBtn active={tab === "downloads"} onClick={() => onTab("downloads")}>
              <Download size={14} strokeWidth={2.1} />
              <span>{t("Downloads")}</span>
              {downloads.length > 0 && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold leading-none tabular-nums ${
                    tab === "downloads"
                      ? "bg-canvas/15 text-canvas"
                      : activeDownloads > 0
                        ? "bg-ink/12 text-ink"
                        : "bg-elevated text-ink-subtle"
                  }`}
                >
                  {activeDownloads > 0 && (
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full animate-pulse motion-reduce:animate-none ${
                        tab === "downloads" ? "bg-canvas" : "bg-ink"
                      }`}
                    />
                  )}
                  {downloads.length}
                </span>
              )}
            </TabBtn>
          )}
          {tabAvailable("local", capabilities) && (
            <TabBtn active={tab === "local"} onClick={() => onTab("local")}>
              <HardDrive size={14} strokeWidth={2.1} />
              {t("Local")}
            </TabBtn>
          )}
          <TabBtn active={tab === "lists"} onClick={() => onTab("lists")}>
            <Layers size={14} strokeWidth={2.1} />
            {t("My Lists")}
          </TabBtn>
        </div>
        {hasExternalTabs && (
          <>
            <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-edge-soft/75" />
            <div className="vayra-pill-track shrink-0">
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
              {malConnected && (
                <TabBtn active={tab === "mal"} onClick={() => onTab("mal")}>
                  <img src={malLogo} alt="" className="h-3.5 w-3.5 rounded-[3px] object-contain" />
                  MAL
                </TabBtn>
              )}
              {letterboxdActive && (
                <TabBtn active={tab === "letterboxd"} onClick={() => onTab("letterboxd")}>
                  <img src={letterboxdLogo} alt="" className="h-3.5 w-3.5 rounded-[3px] object-contain" />
                  Letterboxd
                </TabBtn>
              )}
            </div>
          </>
        )}
      </div>
      <div className="vayra-header-rule" aria-hidden="true" />
    </header>
  );
}

void watchlistHas;
