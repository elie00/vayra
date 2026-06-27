import { Lock } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AddonsIcon } from "@/components/icons/addons-icon";
import { DownloadsNavIcon } from "@/chrome/downloads-nav-icon";
import { AnimeIcon } from "@/components/icons/anime-icon";
import { CalendarIcon } from "@/components/icons/calendar-icon";
import { DiscoverIcon } from "@/components/icons/discover-icon";
import { HomeIcon } from "@/components/icons/home-icon";
import { LibraryIcon } from "@/components/icons/library-icon";
import { LiveTvIcon } from "@/components/icons/live-tv-icon";
import { PlaylistVodIcon } from "@/components/icons/playlist-vod-icon";
import { MoviesIcon } from "@/components/icons/movies-icon";
import { SettingsIcon } from "@/components/icons/settings-icon";
import { TvIcon } from "@/components/icons/tv-icon";
import { HarborMark } from "@/components/icons/harbor-mark";
import { ProfileChip } from "@/chrome/sidebar/profile-chip";
import { CollapseToggle } from "@/chrome/sidebar/collapse-toggle";
import { ParentalPinModal } from "@/components/parental-pin-modal";
import { useT } from "@/lib/i18n";
import { useParental, type LockableTab } from "@/lib/parental";
import { useSettings } from "@/lib/settings";
import { useView, type View } from "@/lib/view";

const FROST = "#88c0d0";
const RAIL = "linear-gradient(180deg, #8fbcbb59, #88c0d033 44%, #b48ead2b 78%, #81a1c14d)";

type NavDef = {
  render: (active: boolean) => ReactNode;
  labelKey: string;
  view: View;
  hideKey?: "anime" | "liveTv" | "sports";
  parentalKey?: LockableTab;
  pinGated?: boolean;
};

const PRIMARY: NavDef[] = [
  { render: (a) => <HomeIcon active={a} />, labelKey: "nav.home", view: "home" },
  { render: (a) => <DiscoverIcon active={a} />, labelKey: "nav.discover", view: "discover", parentalKey: "discover" },
  { render: (a) => <MoviesIcon active={a} />, labelKey: "nav.movies", view: "movies", parentalKey: "movies" },
  { render: (a) => <TvIcon active={a} />, labelKey: "nav.shows", view: "shows", parentalKey: "shows" },
  { render: (a) => <AnimeIcon active={a} />, labelKey: "nav.anime", view: "anime", hideKey: "anime", parentalKey: "anime" },
  { render: (a) => <LiveTvIcon active={a} />, labelKey: "nav.live", view: "live", hideKey: "liveTv", parentalKey: "liveTv" },
  { render: (a) => <PlaylistVodIcon active={a} />, labelKey: "nav.playlists", view: "vod" },
];

const COLLECTIONS: NavDef[] = [
  { render: (a) => <CalendarIcon active={a} />, labelKey: "nav.calendar", view: "calendar", parentalKey: "calendar" },
  { render: (a) => <LibraryIcon active={a} />, labelKey: "nav.library", view: "library", parentalKey: "library" },
  { render: (a) => <DownloadsNavIcon active={a} />, labelKey: "nav.downloads", view: "downloads" },
  { render: (a) => <AddonsIcon active={a} />, labelKey: "nav.addons", view: "addons", parentalKey: "addons" },
  { render: (a) => <SettingsIcon active={a} />, labelKey: "nav.settings", view: "settings", pinGated: true },
];

export function NordSidebar() {
  const { view, setView, chromeHidden } = useView();
  const { locked, unlock, hiddenTabs } = useParental();
  const { settings } = useSettings();
  const t = useT();
  const collapsed = settings.sidebarCollapsed;
  const [pinFor, setPinFor] = useState<View | null>(null);

  const isVisible = (item: NavDef) => {
    if (item.view === "vod" && !settings.showPlaylistsTab) return false;
    if (item.hideKey && settings.hideContent[item.hideKey]) return false;
    if (locked && item.parentalKey && hiddenTabs[item.parentalKey]) return false;
    return true;
  };

  const go = (item: NavDef) => {
    if (item.pinGated && locked) {
      setPinFor(item.view);
      return;
    }
    setView(item.view);
  };

  return (
    <>
      <aside
        aria-hidden={chromeHidden}
        className={`relative z-[60] flex w-[78px] shrink-0 flex-col transition-[opacity,transform,width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[width] ${
          collapsed ? "" : "lg:w-56"
        } ${
          chromeHidden ? "pointer-events-none -translate-x-2 rtl:translate-x-2 opacity-0" : "translate-x-0 opacity-100"
        }`}
      >
        <div
          className="relative flex min-h-0 flex-1 flex-col"
          style={{ background: "linear-gradient(180deg, var(--color-elevated), var(--color-canvas) 46%)" }}
        >
          <GlacierEdge />

          <div
            data-tauri-drag-region
            className={`relative flex h-20 shrink-0 items-center justify-center ${
              collapsed ? "" : "lg:justify-start lg:ps-[27px]"
            }`}
          >
            <button
              type="button"
              onClick={() => setView("home")}
              aria-label={t("chrome.harborHome")}
              className="flex items-center gap-2.5 text-ink"
            >
              <HarborMark className="h-[26px] w-[26px] shrink-0 drop-shadow-[0_0_10px_#88c0d05c]" />
              {!collapsed && (
                <span
                  className="hidden text-[27px] font-medium leading-none lg:inline"
                  style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.4px" }}
                >
                  Harbor
                </span>
              )}
            </button>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="relative flex flex-col">
              <span
                aria-hidden
                className="pointer-events-none absolute start-[39px] top-0 bottom-0 w-px -translate-x-1/2 rtl:translate-x-1/2"
                style={{
                  background: RAIL,
                  maskImage: "linear-gradient(180deg, transparent, #000 7%, #000 93%, transparent)",
                  WebkitMaskImage: "linear-gradient(180deg, transparent, #000 7%, #000 93%, transparent)",
                }}
              />

              {PRIMARY.filter(isVisible).map((item) => (
                <Station key={item.view} item={item} active={view === item.view} collapsed={collapsed} onClick={() => go(item)} />
              ))}

              {COLLECTIONS.filter(isVisible).map((item) => (
                <Station
                  key={item.view}
                  item={item}
                  active={view === item.view}
                  gated={!!item.pinGated && locked}
                  collapsed={collapsed}
                  onClick={() => go(item)}
                />
              ))}
            </div>
          </nav>

          <div className={`relative shrink-0 px-2 pb-3 pt-1 ${collapsed ? "" : "lg:px-3"}`}>
            <FrostLine className="mb-2" />
            <div className={`mb-1 flex ${collapsed ? "justify-center" : ""}`}>
              <CollapseToggle collapsed={collapsed} />
            </div>
            {locked ? (
              <div
                className={`flex items-center justify-center gap-3 py-2.5 ${
                  collapsed ? "" : "lg:justify-start lg:px-3"
                }`}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-subtle"
                  style={{ boxShadow: "inset 0 0 0 1.5px var(--color-edge)" }}
                >
                  <Lock size={16} />
                </div>
                {!collapsed && (
                  <div className="hidden min-w-0 lg:block">
                    <div className="truncate text-[13px] font-medium text-ink-muted">{t("chrome.locked")}</div>
                    <div className="truncate text-[11.5px] text-ink-subtle">{t("chrome.parentalOn")}</div>
                  </div>
                )}
              </div>
            ) : (
              <ProfileChip collapsed={collapsed} />
            )}
          </div>
        </div>
      </aside>

      {pinFor !== null && (
        <ParentalPinModal
          mode={{
            kind: "unlock",
            onUnlock: () => {
              const v = pinFor;
              setPinFor(null);
              if (v) setView(v);
            },
            onCancel: () => setPinFor(null),
          }}
          verify={unlock}
        />
      )}
    </>
  );
}

function Station({
  item,
  active,
  gated,
  collapsed,
  onClick,
}: {
  item: NavDef;
  active: boolean;
  gated?: boolean;
  collapsed?: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const label = t(item.labelKey);
  return (
    <button
      onClick={onClick}
      aria-label={gated ? t("chrome.lockedRequiresPin", { label }) : label}
      title={gated ? t("chrome.lockedShort", { label }) : label}
      className="group relative z-10 flex h-[52px] w-full items-center"
    >
      <span className="flex w-[78px] shrink-0 items-center justify-center">
        <span
          className={`relative grid h-10 w-10 place-items-center rounded-full transition-colors duration-200 ${
            active ? "text-canvas" : "text-ink-muted group-hover:text-ink"
          }`}
        >
          {active ? (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ background: FROST, boxShadow: `0 0 0 4px ${FROST}1c, 0 0 16px 1px ${FROST}73` }}
            />
          ) : (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-canvas ring-[1.5px] ring-[#4c566a] transition-all duration-200 group-hover:ring-[#88c0d0]"
            />
          )}
          <span className="relative overflow-hidden [&_svg]:h-[24px] [&_svg]:w-[24px]">{item.render(false)}</span>
          {gated && (
            <span
              className="absolute -bottom-0.5 -end-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-canvas text-ink-subtle"
              style={{ boxShadow: "0 0 0 1px var(--color-edge)" }}
            >
              <Lock size={9} strokeWidth={2.4} />
            </span>
          )}
        </span>
      </span>
      {!collapsed && (
        <span
          className={`hidden flex-1 pe-4 text-start text-[16.5px] tracking-tight transition-colors duration-200 lg:block ${
            active ? "font-semibold text-ink" : "font-medium text-ink-muted group-hover:text-ink"
          }`}
        >
          {label}
        </span>
      )}
    </button>
  );
}

function FrostLine({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-px w-full ${className ?? ""}`}
      style={{ background: "linear-gradient(90deg, transparent, #88c0d03d 20%, #88c0d03d 80%, transparent)" }}
    />
  );
}

function GlacierEdge() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 end-0 w-px"
      style={{ background: "linear-gradient(180deg, #88c0d04d, #4c566a3d 38%, #4c566a3d)" }}
    />
  );
}
