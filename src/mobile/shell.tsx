import { useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { BarChart3, Layers, LayoutGrid } from "lucide-react";
import { HomeIcon } from "@/components/icons/home-icon";
import { DiscoverIcon } from "@/components/icons/discover-icon";
import { LiveTvIcon } from "@/components/icons/live-tv-icon";
import { LibraryIcon } from "@/components/icons/library-icon";
import { MoviesIcon } from "@/components/icons/movies-icon";
import { TvIcon } from "@/components/icons/tv-icon";
import { AnimeIcon } from "@/components/icons/anime-icon";
import { SportsIcon } from "@/components/icons/sports-icon";
import { PlaylistVodIcon } from "@/components/icons/playlist-vod-icon";
import { CalendarIcon } from "@/components/icons/calendar-icon";
import { AddonsIcon } from "@/components/icons/addons-icon";
import { SettingsIcon } from "@/components/icons/settings-icon";
import { DownloadsNavIcon } from "@/chrome/downloads-nav-icon";
import { ProfileChip } from "@/chrome/sidebar/profile-chip";
import { useT } from "@/lib/i18n";
import { useView, type View } from "@/lib/view";

// ── Plus overlay open/close store (shared with the Back handler) ──────────────
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

type NavIcon = (props: { active?: boolean }) => ReactElement;

const TABS: { view: View; label: string; Icon: NavIcon }[] = [
  { view: "home", label: "nav.home", Icon: HomeIcon },
  { view: "discover", label: "nav.discover", Icon: DiscoverIcon },
  { view: "live", label: "nav.live", Icon: LiveTvIcon },
  { view: "library", label: "nav.library", Icon: LibraryIcon },
];

export function MobileShell() {
  const { topKind, setView, player } = useView();
  const open = usePlusOpen();
  // The tab bar shows everywhere except the fullscreen playback contexts.
  const hidden = !!player || topKind === "picker";

  return (
    <>
      {open && <PlusScreen />}
      {!hidden && (
        <nav
          data-harbor-tabbar
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-[90] flex items-stretch justify-around border-t border-edge-soft/60 bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
        >
          {TABS.map((tab) => (
            <TabButton
              key={tab.view}
              label={tab.label}
              active={!open && topKind === tab.view}
              icon={<tab.Icon active={!open && topKind === tab.view} />}
              onClick={() => {
                setPlusOpen(false);
                setView(tab.view);
              }}
            />
          ))}
          <TabButton
            label="More"
            active={open}
            icon={<LayoutGrid size={24} strokeWidth={open ? 2.4 : 1.9} />}
            onClick={() => setPlusOpen(!open)}
          />
        </nav>
      )}
    </>
  );
}

function TabButton({
  label,
  active,
  icon,
  onClick,
}: {
  label: string;
  active: boolean;
  icon: ReactNode;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex h-16 flex-1 flex-col items-center justify-center gap-1 transition-colors ${
        active ? "text-accent" : "text-ink-subtle hover:text-ink-muted"
      }`}
    >
      {icon}
      <span className="text-[10.5px] font-medium leading-none">{t(label)}</span>
    </button>
  );
}

function PlusScreen() {
  const t = useT();
  const view = useView();
  const go = (fn: () => void) => {
    fn();
    setPlusOpen(false);
  };
  const dests: { label: string; icon: ReactNode; onGo: () => void }[] = [
    { label: "nav.movies", icon: <MoviesIcon />, onGo: () => view.setView("movies") },
    { label: "nav.shows", icon: <TvIcon />, onGo: () => view.setView("shows") },
    { label: "nav.anime", icon: <AnimeIcon />, onGo: () => view.setView("anime") },
    { label: "nav.sports", icon: <SportsIcon />, onGo: () => view.setView("sports") },
    { label: "nav.playlists", icon: <PlaylistVodIcon />, onGo: () => view.setView("vod") },
    { label: "nav.calendar", icon: <CalendarIcon />, onGo: () => view.setView("calendar") },
    { label: "Collections", icon: <Layers size={24} strokeWidth={1.8} />, onGo: () => view.openCollections() },
    { label: "nav.downloads", icon: <DownloadsNavIcon active={false} />, onGo: () => view.setView("downloads") },
    { label: "Stats", icon: <BarChart3 size={24} strokeWidth={1.8} />, onGo: () => view.openStats() },
    { label: "nav.addons", icon: <AddonsIcon />, onGo: () => view.setView("addons") },
    { label: "nav.settings", icon: <SettingsIcon />, onGo: () => view.openSettings() },
  ];
  return (
    <div
      data-harbor-plus
      className="fixed inset-0 z-[80] overflow-y-auto bg-canvas pt-[calc(5rem+var(--harbor-status-bar,1.75rem))] pb-[calc(5rem+env(safe-area-inset-bottom))]"
    >
      <div className="px-5">
        <ProfileChip />
        <div className="mt-5 grid grid-cols-3 gap-3">
          {dests.map((d) => (
            <button
              key={d.label}
              type="button"
              onClick={() => go(d.onGo)}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-edge-soft/60 bg-elevated/50 px-2 py-5 text-ink-muted transition-transform active:scale-95"
            >
              {d.icon}
              <span className="text-[12px] font-medium text-ink">{t(d.label)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
