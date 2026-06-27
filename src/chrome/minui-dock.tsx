import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { ParentalPinModal } from "@/components/parental-pin-modal";
import { useT } from "@/lib/i18n";
import { useParental, type LockableTab } from "@/lib/parental";
import { useSettings } from "@/lib/settings";
import { useView, type View } from "@/lib/view";
import { DockButton } from "./minui-dock/dock-button";
import { FloatingTop } from "./minui-dock/floating-top";

type DockItem = {
  view: View;
  label: string;
  icon: (active: boolean) => ReactNode;
  hideKey?: "anime" | "liveTv" | "sports";
  parentalKey?: LockableTab;
};

const ITEMS: DockItem[] = [
  { view: "home", label: "Home", icon: (a) => <HomeIcon active={a} /> },
  { view: "discover", label: "Discover", icon: (a) => <DiscoverIcon active={a} />, parentalKey: "discover" },
  { view: "movies", label: "Movies", icon: (a) => <MoviesIcon active={a} />, parentalKey: "movies" },
  { view: "shows", label: "Shows", icon: (a) => <TvIcon active={a} />, parentalKey: "shows" },
  { view: "anime", label: "Anime", icon: (a) => <AnimeIcon active={a} />, hideKey: "anime", parentalKey: "anime" },
  { view: "live", label: "Live TV", icon: (a) => <LiveTvIcon active={a} />, hideKey: "liveTv", parentalKey: "liveTv" },
  { view: "vod", label: "Playlists", icon: (a) => <PlaylistVodIcon active={a} /> },
  { view: "calendar", label: "Calendar", icon: (a) => <CalendarIcon active={a} />, parentalKey: "calendar" },
  { view: "library", label: "Library", icon: (a) => <LibraryIcon active={a} />, parentalKey: "library" },
  { view: "downloads", label: "Downloads", icon: (a) => <DownloadsNavIcon active={a} /> },
  { view: "addons", label: "Addons", icon: (a) => <AddonsIcon active={a} />, parentalKey: "addons" },
  { view: "settings", label: "Settings", icon: (a) => <SettingsIcon active={a} /> },
];

const ICON_BASE = 54;
const ICON_GAP = 6;
const MAG_RANGE = 140;
const MAG_PEAK = 1.42;

export function MinUIDock() {
  const { view, setView, chromeHidden } = useView();
  const { locked, unlock, hiddenTabs } = useParental();
  const { settings } = useSettings();
  const t = useT();
  const [pinFor, setPinFor] = useState<View | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const buttonCentersRef = useRef<number[]>([]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const visible = ITEMS.filter((it) => {
    if (it.view === "vod" && !settings.showPlaylistsTab) return false;
    if (it.hideKey && settings.hideContent[it.hideKey]) return false;
    if (it.parentalKey && locked && hiddenTabs[it.parentalKey]) return false;
    return true;
  });

  const computeCenters = (scales: number[]) => {
    const centers: number[] = [];
    let cursor = 0;
    for (let i = 0; i < scales.length; i++) {
      const width = ICON_BASE * scales[i];
      centers.push(cursor + width / 2);
      cursor += width + ICON_GAP;
    }
    return centers;
  };

  let firstPassScales = visible.map(() => 1);
  if (cursor != null) {
    const centers = buttonCentersRef.current.length === visible.length
      ? buttonCentersRef.current
      : computeCenters(firstPassScales);
    firstPassScales = centers.map((c) => magnify(Math.abs(cursor - c)));
  }
  buttonCentersRef.current = computeCenters(firstPassScales);

  const navigate = (it: DockItem) => {
    if (it.parentalKey && locked && hiddenTabs[it.parentalKey]) {
      setPinFor(it.view);
      return;
    }
    setView(it.view);
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const rtl = getComputedStyle(trackRef.current).direction === "rtl";
    setCursor(rtl ? rect.right - e.clientX : e.clientX - rect.left);
  };

  return (
    <>
      <FloatingTop />
      <div
        aria-hidden={chromeHidden}
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex items-end justify-center pb-6 transition-opacity duration-300 ${chromeHidden ? "opacity-0" : "opacity-100"}`}
      >
        <div
          className="harbor-minui-shell pointer-events-auto rounded-[28px] border border-edge p-1.5 shadow-[0_30px_60px_-22px_rgba(15,15,18,0.32),0_4px_18px_-6px_rgba(15,15,18,0.16)] backdrop-blur-xl"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.78))",
            transform: `translateY(${mounted ? 0 : 28}px)`,
            opacity: mounted ? 1 : 0,
            transition:
              "transform 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 300ms ease",
          }}
        >
          <div
            ref={trackRef}
            onPointerMove={onMove}
            onPointerLeave={() => setCursor(null)}
            className="flex items-end px-2 pt-3 pb-2"
            style={{ gap: `${ICON_GAP}px` }}
          >
            {visible.map((it, i) => {
              const active = view === it.view;
              const scale = firstPassScales[i] ?? 1;
              return (
                <DockButton
                  key={it.view}
                  label={t(it.label)}
                  active={active}
                  scale={scale}
                  baseSize={ICON_BASE}
                  onClick={() => navigate(it)}
                >
                  <span
                    className="block"
                    style={{
                      transform: `scale(${0.92 + scale * 0.08})`,
                      transition: "transform 140ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                    }}
                  >
                    {it.icon(active)}
                  </span>
                </DockButton>
              );
            })}
          </div>
        </div>
      </div>
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

function magnify(distance: number): number {
  if (distance > MAG_RANGE) return 1;
  const t = 1 - distance / MAG_RANGE;
  const eased = (1 - Math.cos(t * Math.PI)) / 2;
  return 1 + (MAG_PEAK - 1) * eased;
}
