import { useSyncExternalStore, type ReactNode } from "react";
import { Bookmark, Home, Search, X } from "lucide-react";
import { ProfileChip } from "@/chrome/sidebar/profile-chip";
import { MOVIE_GENRES } from "@/lib/feed/tags";
import { useT } from "@/lib/i18n";
import { useSearch } from "@/lib/search-context";
import { useView, type View } from "@/lib/view";
import { MacNowPlayingBar, MacRemoteSheet } from "@/mobile/mac-now-playing";
import { MobileTogetherSheet } from "@/mobile/together-sheet";

// The phone's navigation, after HBO Max: three icon tabs — Home, My list and
// Search — and a menu behind the header's ☰ for everything else: shows,
// movies, anime, sports, live TV, genres, then downloads, addons and settings.

// ── Menu open/close store (shared with the Back handler) ──────────────────────
let plusOpen = false;
const subs = new Set<() => void>();
export function setPlusOpen(v: boolean): void {
  if (plusOpen === v) return;
  plusOpen = v;
  subs.forEach((f) => f());
}
export function getPlusOpen(): boolean {
  return plusOpen;
}
export function usePlusOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => plusOpen,
    () => false,
  );
}

type TabId = "home" | "mylist" | "search";

export function MobileShell() {
  const t = useT();
  const { topKind, setView, player } = useView();
  const { open: searchOpen, setOpen: setSearchOpen } = useSearch();
  const menuOpen = usePlusOpen();
  // The tab bar shows everywhere except the fullscreen playback contexts.
  const hidden = !!player || topKind === "picker";
  const active: TabId | null = searchOpen ? "search" : topKind === "library" ? "mylist" : topKind === "home" ? "home" : null;

  const go = (tab: TabId) => {
    setPlusOpen(false);
    if (tab === "search") {
      setSearchOpen(true);
      return;
    }
    setSearchOpen(false);
    setView(tab === "home" ? "home" : "library");
  };

  const tabs: { id: TabId; label: string; icon: ReactNode }[] = [
    { id: "home", label: t("nav.home"), icon: <Home size={25} strokeWidth={active === "home" ? 2.4 : 1.8} fill={active === "home" ? "currentColor" : "none"} /> },
    { id: "mylist", label: t("My list"), icon: <Bookmark size={24} strokeWidth={active === "mylist" ? 2.4 : 1.8} fill={active === "mylist" ? "currentColor" : "none"} /> },
    { id: "search", label: t("Search"), icon: <Search size={25} strokeWidth={active === "search" ? 2.6 : 1.8} /> },
  ];

  return (
    <>
      {menuOpen && <MenuScreen />}
      <MobileTogetherSheet />
      {!hidden && !menuOpen && <MacNowPlayingBar />}
      <MacRemoteSheet />
      {!hidden && (
        <nav
          data-vayra-tabbar
          aria-label={t("Primary")}
          // Above the search page while it is open (search is a tab); below the
          // bottom sheets otherwise.
          className={`vayra-tabbar fixed inset-x-0 bottom-0 ${searchOpen ? "z-[205]" : "z-[90]"} pb-[var(--vayra-safe-bottom)]`}
        >
          <div className="flex items-stretch">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => go(tab.id)}
                aria-label={tab.label}
                aria-current={active === tab.id ? "page" : undefined}
                className={`group flex h-16 flex-1 items-center justify-center transition-colors duration-150 ${
                  active === tab.id ? "text-ink" : "text-ink-subtle"
                }`}
              >
                <span className="transition-transform duration-150 ease-out group-active:scale-90">{tab.icon}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}

function MenuScreen() {
  const t = useT();
  const view = useView();
  const go = (fn: () => void) => {
    fn();
    setPlusOpen(false);
  };
  const to = (v: View) => () => view.setView(v);
  const sections: { label: string; onGo: () => void }[] = [
    { label: "nav.shows", onGo: to("shows") },
    { label: "nav.movies", onGo: to("movies") },
    { label: "nav.anime", onGo: to("anime") },
    { label: "nav.sports", onGo: to("sports") },
    // Live TV needs a playlist set up first, so it sits here rather than in the tab bar.
    { label: "nav.live", onGo: to("live") },
    { label: "nav.discover", onGo: to("discover") },
  ];
  const more: { label: string; onGo: () => void }[] = [
    { label: "nav.downloads", onGo: to("downloads") },
    { label: "Collections", onGo: () => view.openCollections() },
    { label: "nav.calendar", onGo: to("calendar") },
    { label: "nav.playlists", onGo: to("vod") },
    { label: "Stats", onGo: () => view.openStats() },
    { label: "nav.addons", onGo: to("addons") },
    { label: "nav.settings", onGo: () => view.openSettings() },
  ];
  // The fixed layer must NOT scroll itself: Android WebView leaves a stale ghost
  // copy of a scrolled position:fixed+overflow element (the "two offset grids /
  // white bands" bug). So the fixed element is a stable opaque compositing layer
  // (transform-gpu + isolate) and the scroll lives on a normal in-flow child.
  return (
    <div data-vayra-plus role="dialog" aria-modal="true" aria-label={t("Menu")} className="fixed inset-0 z-[200] isolate transform-gpu bg-canvas/90 backdrop-blur-2xl">
      <div className="flex h-full flex-col overflow-y-auto overscroll-contain px-6 pb-[calc(5rem+var(--vayra-safe-bottom))] pt-[var(--harbor-status-bar,1.75rem)]">
        <div className="-ms-3 flex h-14 shrink-0 items-center">
          <button
            type="button"
            onClick={() => setPlusOpen(false)}
            aria-label={t("common.close")}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink active:bg-elevated"
          >
            <X size={26} strokeWidth={1.9} />
          </button>
        </div>
        <div className="mt-2">
          <ProfileChip menuPlacement="below" />
        </div>
        <nav className="mt-4 flex flex-col">
          {sections.map((s) => (
            <MenuLink key={s.label} big onClick={() => go(s.onGo)}>
              {t(s.label)}
            </MenuLink>
          ))}
        </nav>
        <hr className="my-4 w-2/3 border-white/15" />
        <p className="pb-1 type-caption font-semibold uppercase tracking-[0.18em] text-ink-subtle">{t("Categories")}</p>
        <nav className="flex flex-col">
          {Object.entries(MOVIE_GENRES).map(([name, id]) => (
            <MenuLink key={name} onClick={() => go(() => view.openFilter({ kind: "genre", mediaType: "movie", name, id }))}>
              {t(name)}
            </MenuLink>
          ))}
        </nav>
        <hr className="my-4 w-2/3 border-white/15" />
        <nav className="flex flex-col">
          {more.map((s) => (
            <MenuLink key={s.label} muted onClick={() => go(s.onGo)}>
              {t(s.label)}
            </MenuLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

function MenuLink({ big = false, muted = false, onClick, children }: { big?: boolean; muted?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`self-start py-2.5 text-start transition-opacity active:opacity-60 ${
        big ? "type-title-1 font-semibold text-ink" : muted ? "type-callout text-ink-muted" : "type-body text-ink"
      }`}
    >
      {children}
    </button>
  );
}
