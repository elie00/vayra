import { ArrowLeft, Menu, Search, Users } from "lucide-react";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { BackChrome } from "@/chrome/back-chrome";
import { HarborMark } from "@/components/icons/harbor-mark";
import { DownloadsButton } from "@/components/downloads-popover";
import { RecordingPill } from "@/chrome/recording-pill";
import {
  effectiveBinding,
  formatBindingForDisplay,
} from "@/lib/hotkeys";
import { useT } from "@/lib/i18n";
import { useSearch } from "@/lib/search-context";
import { useSettings } from "@/lib/settings";
import { useTogether } from "@/lib/together/provider";
import { useSelfIdentity } from "@/lib/together/use-self-identity";
import { activeLayout } from "@/lib/theme";
import { useThemePreview } from "@/lib/theme-preview";
import { useView } from "@/lib/view";
import { useWindowFullscreen } from "@/lib/use-window-fullscreen";

import {
  close,
  minimize,
  toggleMaximize,
  useMaximized,
  windowControlShortcut,
  windowZoomLabel,
} from "@/lib/window";
import { desktopUx, hasNativeDesktopUx, isMobileTauri } from "@/lib/platform";
import { toggleNavDrawer } from "@/lib/nav-drawer";

const TogetherPopover = lazy(() => import("@/components/together-modal").then((m) => ({ default: m.TogetherPopover })));
const MobileHeader = lazy(() => import("@/mobile/header").then((m) => ({ default: m.MobileHeader })));
const MobileBackBar = lazy(() => import("@/mobile/header").then((m) => ({ default: m.MobileBackBar })));

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function Topbar({ connecting = false }: { connecting?: boolean } = {}) {
  const { chromeHidden, canGoBack, view, setView, topKind } = useView();
  const { settings } = useSettings();
  const t = useT();
  const preview = useThemePreview();
  const fullscreen = useWindowFullscreen();
  const maxed = useMaximized();
  const scrolled = useDesktopScrolledPast(8, `${topKind}:${view}`);
  if (chromeHidden && !connecting) return null;
  const layout = hasNativeDesktopUx() ? "sidebar" : preview ? preview.layout : activeLayout(settings.theme);
  const onLiveRoot = topKind === "live";
  const quietDesktopHeader = hasNativeDesktopUx();
  const sidebarHidden = connecting || view === "settings" || (onLiveRoot && !quietDesktopHeader) || topKind === "picker";
  // On native desktop, quick search lives directly in the left VAYRA rail so
  // the top edge stays calm and lets cinema artwork breathe edge-to-edge;
  // Settings and the source picker also suppress the top search pill.
  const searchInSidebar = quietDesktopHeader && !sidebarHidden;
  const hideSearch = view === "addons" || searchInSidebar || (view === "settings" && quietDesktopHeader) || topKind === "picker";
  // On mobile the primary nav is the bottom tab bar (MobileShell), so the header
  // reserves no rail space and shows no hamburger (the drawer is kept in the code
  // but intentionally unreachable on mobile).
  const mobile = isMobileTauri();
  const showHamburger = false;
  const sidebarOffset = mobile
    ? ""
    : layout === "stremio"
      ? "ps-[80px]"
      : settings.sidebarCollapsed
        ? "ps-[84px]"
        : "ps-[84px] min-[960px]:ps-[252px]";
  const searchWidth = canGoBack
    ? "w-[16rem] sm:w-[22rem] lg:w-[26rem] xl:w-[28rem]"
    : "w-[16rem] sm:w-[22rem] lg:w-[26rem] xl:w-[30rem]";
  const dragProps = IS_TAURI && !fullscreen ? { "data-tauri-drag-region": true } : {};

  // Mobile: the streaming-app header on tab-level views (MobileHeader), a Back
  // top bar on stacked views (MobileBackBar), never the desktop right-cluster
  // (recording/downloads) or window controls. Live TV, opened from the menu,
  // gets the same header as every other page.
  if (mobile) {
    return (
      <Suspense fallback={null}>
        {!(canGoBack && !connecting) ? (
          <MobileHeader raised={topKind === "picker" || connecting} />
        ) : (
          <MobileBackBar />
        )}
      </Suspense>
    );
  }

  return (
    <header
      data-vayra-topbar
      data-scrolled={scrolled ? "" : undefined}
      className={`fixed inset-x-0 top-0 ${topKind === "picker" || connecting ? "z-[130]" : "z-[55]"} ${
        quietDesktopHeader ? "h-16" : "h-20"
      } transition-[background-color,backdrop-filter,box-shadow] duration-200 ${
        scrolled ? "vayra-topbar-scrolled" : ""
      }`}
    >
      <div
        {...dragProps}
        className="relative z-10 grid h-full grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-8"
      >
        <div
          {...dragProps}
          className={
            sidebarHidden
              ? "flex h-full min-w-0 items-center justify-start gap-3"
              : `flex h-full min-w-0 items-center justify-start ${sidebarOffset}`
          }
        >
          {showHamburger && (
            <button
              type="button"
              onClick={toggleNavDrawer}
              aria-label={t("Open menu")}
              data-tauri-drag-region="false"
              className="vayra-chrome-pill h-9 w-9 shrink-0"
            >
              <Menu size={18} strokeWidth={2} />
            </button>
          )}
          {onLiveRoot && (
            <button
              type="button"
              onClick={() => setView("home")}
              aria-label={t("common.back")}
              className="vayra-chrome-pill h-9 shrink-0 gap-2 ps-3 pe-4 text-[13px] font-medium"
            >
              <ArrowLeft size={15} strokeWidth={2.1} className="dir-icon" />
              {t("common.back")}
            </button>
          )}
          {onLiveRoot && (
            <div className="flex items-center gap-1.5 text-ink">
              <HarborMark className="h-7 w-7" />
              <span className="font-display text-[18px] font-semibold leading-none tracking-[-0.015em]">
                {t("Live")}
              </span>
            </div>
          )}
          {/* The desktop settings navigation carries its own Back button. */}
          {!onLiveRoot && !connecting && !(view === "settings" && quietDesktopHeader) && <BackChrome />}
        </div>
        <div
          {...dragProps}
          className={`min-w-0 max-w-full transition-[width] duration-200 ease-out ${searchWidth}`}
        >
          {!hideSearch && <SearchPill />}
        </div>
        <div
          {...dragProps}
          className="flex h-full min-w-0 items-center justify-end gap-2"
        >
          <RecordingPill />
          <DownloadsButton />
          {!onLiveRoot && <TogetherButton />}
          {IS_TAURI && !settings.useNativeTitleBar && (
            <div
              data-tauri-drag-region="false"
              className="ms-1 inline-flex items-center gap-0.5 rounded-full border border-edge-soft/75 bg-surface/85 p-0.5 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] backdrop-blur-xl"
            >
              <Control
                label={t("chrome.minimize")}
                shortcut={windowControlShortcut("minimize")}
                onClick={() => void minimize()}
              >
                <svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 13 13" fill="none">
                  <path d="M3 6.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </Control>
              <Control
                label={windowZoomLabel(maxed, t)}
                shortcut={windowControlShortcut("zoom")}
                onClick={() => void toggleMaximize()}
              >
                <svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 13 13" fill="none">
                  {maxed ? (
                    <>
                      <rect x="2.5" y="4.5" width="6" height="6" stroke="currentColor" strokeWidth="1.4" rx="1" />
                      <path d="M5 4.5V3a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5H9" stroke="currentColor" strokeWidth="1.4" fill="none" />
                    </>
                  ) : (
                    <rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="1.4" rx="1.2" />
                  )}
                </svg>
              </Control>
              <Control
                label={t("common.close")}
                shortcut={windowControlShortcut("close")}
                onClick={close}
                danger
              >
                <svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 13 13" fill="none">
                  <path d="M3.5 3.5l6 6M9.5 3.5l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </Control>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

const TOPBAR_MAX_AVATARS = 3;

export function TogetherButton({
  variant = "chip",
  popoverPlacement = "below-right",
  connectStyle = "popover",
}: {
  variant?: "chip" | "ghost";
  popoverPlacement?: "below-right" | "above-left";
  connectStyle?: "tab" | "popover";
} = {}) {
  const { snapshot, modalOpen, openModal, closeModal, clientId } = useTogether();
  const { avatar: selfAvatar, color: selfColor } = useSelfIdentity();
  const t = useT();
  const live = snapshot.state === "joined";
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modalOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) closeModal();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [modalOpen, closeModal]);

  const visible = snapshot.participants.slice(0, TOPBAR_MAX_AVATARS);
  const overflow = Math.max(0, snapshot.participants.length - TOPBAR_MAX_AVATARS);

  const above = popoverPlacement === "above-left";
  const idleSize = live
    ? "h-9 gap-2 ps-3 pe-2"
    : "h-9 w-9 justify-center";
  const sizing =
    modalOpen && !above ? (live ? "h-12 gap-2 px-3" : "h-12 w-9 justify-center") : idleSize;
  const idleChrome =
    variant === "ghost"
      ? `rounded-full border border-transparent ${
          live ? "text-ink hover:bg-white/12" : "text-ink-muted hover:bg-white/12 hover:text-ink"
        }`
      : `vayra-chrome-pill ${live ? "border-edge text-ink" : ""}`;
  const chrome = modalOpen
    ? `z-[51] harbor-together-surface border border-edge text-ink ${
        above ? "rounded-t-none rounded-b-lg border-t-0" : "rounded-b-none rounded-t-lg border-b-0"
      }`
    : idleChrome;

  return (
    <div ref={wrapRef} className={`relative ${modalOpen && !above ? "harbor-wt-wrap flex flex-col self-stretch justify-end" : ""}`}>
      <button
        type="button"
        aria-label={t("chrome.watchTogether")}
        onClick={() => (modalOpen ? closeModal() : openModal())}
        className={`relative flex items-center transition-colors duration-150 ${modalOpen && !above ? "harbor-wt-tab" : ""} ${sizing} ${chrome}`}
      >
        {live ? (
          <>
            <span className="font-mono text-[11.5px] tracking-[0.22em] text-ink">
              {snapshot.room}
            </span>
            <div className="flex -space-x-1.5">
              {visible.map((p) => {
                const self = p.id === clientId;
                const fallbackColor = `oklch(0.78 0.13 ${nameHue(p.name)})`;
                const avatarSrc = self ? selfAvatar : p.avatar ?? null;
                const color = self ? selfColor ?? fallbackColor : p.color ?? fallbackColor;
                if (avatarSrc) {
                  return (
                    <span
                      key={p.id}
                      title={p.name}
                      className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full ring-2 ring-elevated"
                      style={{ boxShadow: `inset 0 0 0 1.5px ${color}` }}
                    >
                      <img
                        src={avatarSrc}
                        alt=""
                        draggable={false}
                        className="h-full w-full object-cover"
                      />
                    </span>
                  );
                }
                return (
                  <span
                    key={p.id}
                    title={p.name}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-canvas ring-2 ring-elevated"
                    style={{ backgroundColor: color }}
                  >
                    {(p.name.trim()[0] || "?").toUpperCase()}
                  </span>
                );
              })}
              {overflow > 0 && (
                <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-canvas px-1 text-[10px] font-semibold text-ink-muted ring-2 ring-elevated">
                  +{overflow}
                </span>
              )}
            </div>
          </>
        ) : (
          <Users size={16} strokeWidth={1.9} />
        )}
      </button>
      {modalOpen && (
        <div
          className={`harbor-wt-modal absolute z-50 ${
            above ? "bottom-[calc(100%-1px)] start-0" : "end-0 top-[calc(100%-1px)]"
          }`}
        >
          <Suspense fallback={null}>
            <TogetherPopover placement={popoverPlacement} connectStyle={connectStyle} />
          </Suspense>
        </div>
      )}
    </div>
  );
}

function nameHue(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function SearchPill() {
  const { setOpen } = useSearch();
  const { settings } = useSettings();
  const t = useT();
  const binding = effectiveBinding("globalSearchFocus", settings.hotkeys ?? {});
  const os = desktopUx();

  return (
    <button
      type="button"
      data-tauri-drag-region="false"
      aria-keyshortcuts={os === "mac" ? "Meta+F" : os === "windows" ? "Control+F" : undefined}
      onClick={() => setOpen(true)}
      className="flex h-10 w-full items-center gap-3 rounded-full border border-edge-soft/75 bg-surface/85 px-4.5 text-start opacity-95 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-[opacity,background-color,border-color] duration-200 hover:border-edge hover:bg-elevated hover:opacity-100"
    >
      <Search size={15} strokeWidth={1.85} className="text-ink-subtle" />
      <span className="flex-1 truncate text-[13.5px] text-ink-subtle">{t("search.placeholder")}</span>
      <kbd className="hidden shrink-0 rounded-md border border-edge-soft bg-canvas/50 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-ink-subtle sm:inline">
        {os === "mac" ? "⌘ F" : os === "windows" ? "Ctrl F" : formatBindingForDisplay(binding)}
      </kbd>
    </button>
  );
}

function Control({
  label,
  shortcut,
  onClick,
  danger,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts={shortcut}
      title={label}
      onClick={onClick}
      className={`flex h-8 w-9 items-center justify-center rounded-full text-ink-muted transition-[color,background-color] duration-150 ${
        danger ? "hover:bg-danger hover:text-white" : "hover:bg-elevated hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function useDesktopScrolledPast(threshold: number, viewKey: string): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    setScrolled(false);
    const onScroll = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight) return;
      if (el.closest("aside, nav")) return;
      setScrolled(el.scrollTop > threshold);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, [threshold, viewKey]);
  return scrolled;
}
