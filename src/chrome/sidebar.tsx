import { ChevronDown, Lock, Pin, Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { HarborMark } from "@/components/icons/harbor-mark";
import {
  COLLECTION_NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  NAV_ITEMS,
  type NavItem as CanonicalNavItem,
} from "@/chrome/nav-items";
import { ProfileChip } from "@/chrome/sidebar/profile-chip";
import { useActiveDownloadCount } from "@/lib/download/downloads-store";
import { effectiveBinding, formatBindingForDisplay } from "@/lib/hotkeys";
import { useT } from "@/lib/i18n";
import { useSearch } from "@/lib/search-context";
import { useSettings } from "@/lib/settings";
import { getThemeById } from "@/lib/theme";
import { ParentalPinModal } from "@/components/parental-pin-modal";
import { useParental, type LockableTab } from "@/lib/parental";
import { useView, type View } from "@/lib/view";
import { CollapseToggle } from "@/chrome/sidebar/collapse-toggle";
import { desktopUx, hasNativeDesktopUx, isMobileTauri } from "@/lib/platform";
import { isExploreView, isLibraryView, MAC_EXPLORE_VIEWS, MAC_PRIMARY_VIEWS, sanitizeMacPins } from "./mac-navigation";
import { setNavDrawer, useNavDrawer } from "@/lib/nav-drawer";

export function Sidebar() {
  const { view, setView, chromeHidden } = useView();
  const { locked, unlock, hiddenTabs } = useParental();
  const { settings } = useSettings();
  const t = useT();
  const [pendingPinView, setPendingPinView] = useState<View | null>(null);

  // On mobile Tauri the rail becomes a slide-over drawer so it never reserves
  // horizontal space; on desktop it stays the in-flow collapsible rail.
  const mobile = isMobileTauri();
  const drawerOpen = useNavDrawer();
  const navigate = (v: View) => {
    setView(v);
    if (mobile) setNavDrawer(false);
  };

  const themePreset =
    settings.theme.preset !== "custom" ? getThemeById(settings.theme.preset) : null;
  const customMark = themePreset?.logo?.mark ?? null;
  const customWordmark = themePreset?.logo?.wordmark ?? null;
  const collapsed = mobile ? true : settings.sidebarCollapsed;

  return (
    <>
      {mobile && drawerOpen && !chromeHidden && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("common.close")}
          className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-[2px]"
          onClick={() => setNavDrawer(false)}
        />
      )}
      <aside
        data-desktop-sidebar={hasNativeDesktopUx() ? "" : undefined}
        data-harbor-nav-drawer={mobile ? "" : undefined}
        aria-hidden={chromeHidden || (mobile && !drawerOpen)}
        className={
          mobile
            ? `fixed inset-y-0 start-0 z-[80] flex w-[72px] flex-col border-e border-edge-soft bg-canvas transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                drawerOpen && !chromeHidden
                  ? "translate-x-0"
                  : "pointer-events-none -translate-x-full rtl:translate-x-full"
              }`
            : `relative z-[60] flex w-[72px] shrink-0 flex-col border-e border-edge-soft bg-canvas transition-[opacity,transform,width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[width] ${
                collapsed ? "" : "min-[960px]:w-[244px]"
              } ${
                chromeHidden
                  ? "pointer-events-none -translate-x-2 rtl:translate-x-2 opacity-0"
                  : "translate-x-0 opacity-100"
              }`
        }
      >
        <div
          data-tauri-drag-region
          className={`flex h-16 shrink-0 items-center justify-center px-3 pt-1 text-ink ${
            collapsed ? "" : "min-[960px]:justify-between min-[960px]:ps-5 min-[960px]:pe-3.5"
          }`}
        >
          <button
            type="button"
            data-tauri-drag-region="false"
            onClick={() => navigate("home")}
            aria-label={t("chrome.harborHome")}
            className="group flex min-w-0 items-center gap-2.5 rounded-xl px-1 py-1 text-ink transition-opacity duration-150 hover:opacity-90"
          >
            {customMark ? (
              <img
                src={customMark}
                alt=""
                draggable={false}
                className="h-8 w-8 shrink-0 object-contain min-[960px]:h-8 min-[960px]:w-8"
              />
            ) : (
              <HarborMark className="h-8 w-8 shrink-0" />
            )}
            {!collapsed &&
              (customWordmark ? (
                <img
                  src={customWordmark}
                  alt=""
                  draggable={false}
                  className="hidden h-7 w-auto object-contain min-[960px]:inline-block"
                />
              ) : (
                <span
                  className="hidden whitespace-nowrap text-[17px] font-semibold leading-none tracking-[0.18em] text-ink min-[960px]:inline"
                  style={{
                    fontFamily: "var(--font-display)",
                  }}
                >
                  VAYRA
                </span>
              ))}
          </button>
          {!mobile && !collapsed && (
            <div className="hidden min-[960px]:flex">
              <CollapseToggle collapsed={false} compact />
            </div>
          )}
        </div>
        {!mobile && hasNativeDesktopUx() && <SidebarSearchTrigger collapsed={collapsed} />}
        <ScrollableNav
          view={view}
          setView={navigate}
          locked={locked}
          collapsed={collapsed}
          hiddenTabs={hiddenTabs}
          onPinNav={(v) => setPendingPinView(v)}
        />
        <div className={`relative p-2.5 ${collapsed ? "" : "min-[960px]:px-3.5 min-[960px]:pb-3.5 min-[960px]:pt-2.5"}`}>
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-edge-soft/60 to-transparent ${
              collapsed ? "" : "min-[960px]:inset-x-4"
            }`}
          />
          {!mobile && collapsed && (
            <div className="hidden justify-center pb-2 min-[960px]:flex">
              <CollapseToggle collapsed />
            </div>
          )}
          {locked ? (
            <div
              className={`flex w-full items-center justify-center gap-3 rounded-xl py-2 ${
                collapsed ? "" : "min-[960px]:justify-start min-[960px]:border min-[960px]:border-edge-soft/60 min-[960px]:bg-surface/80 min-[960px]:px-2.5"
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-edge-soft bg-elevated/60 text-ink-subtle">
                <Lock size={15} />
              </div>
              {!collapsed && (
                <div className="hidden min-w-0 flex-1 min-[960px]:block">
                  <div className="truncate text-[13px] font-medium text-ink-muted">{t("chrome.locked")}</div>
                  <div className="truncate text-[11.5px] text-ink-subtle">{t("chrome.parentalOn")}</div>
                </div>
              )}
            </div>
          ) : (
            <ProfileChip collapsed={collapsed} />
          )}
        </div>
      </aside>
      {pendingPinView && (
        <ParentalPinModal
          mode={{
            kind: "unlock",
            onUnlock: () => {
              const v = pendingPinView;
              setPendingPinView(null);
              if (v) navigate(v);
            },
            onCancel: () => setPendingPinView(null),
          }}
          verify={unlock}
        />
      )}
    </>
  );
}

function SidebarSearchTrigger({ collapsed }: { collapsed: boolean }) {
  const { setOpen } = useSearch();
  const { settings } = useSettings();
  const t = useT();
  const os = desktopUx();
  const binding = effectiveBinding("globalSearchFocus", settings.hotkeys ?? {});
  const kbd = os === "mac" ? "⌘F" : os === "windows" ? "Ctrl F" : formatBindingForDisplay(binding);

  return (
    <div className={`shrink-0 pb-2 pt-1 ${collapsed ? "flex justify-center px-3" : "px-3 min-[960px]:px-3.5"}`}>
      <button
        type="button"
        data-tauri-drag-region="false"
        onClick={() => setOpen(true)}
        aria-label={t("common.search")}
        aria-keyshortcuts={os === "mac" ? "Meta+F" : os === "windows" ? "Control+F" : undefined}
        title={`${t("common.search")} (${kbd})`}
        className={`group flex h-10 items-center justify-center rounded-xl border border-edge-soft/75 bg-surface/90 text-ink-subtle transition-[border-color,background-color,color] duration-150 hover:border-edge hover:bg-elevated hover:text-ink ${
          collapsed ? "w-10" : "w-10 min-[960px]:w-full min-[960px]:justify-start min-[960px]:gap-2.5 min-[960px]:px-3"
        }`}
      >
        <Search size={15} strokeWidth={2} className="shrink-0" aria-hidden="true" />
        {!collapsed && (
          <>
            <span className="hidden min-w-0 flex-1 truncate text-start text-[13px] font-medium text-ink-subtle group-hover:text-ink-muted min-[960px]:inline">
              {t("common.search")}
            </span>
            <kbd className="hidden shrink-0 rounded-md border border-edge-soft/75 bg-canvas/70 px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-subtle min-[960px]:inline">
              {kbd}
            </kbd>
          </>
        )}
      </button>
    </div>
  );
}

function ScrollableNav({
  view,
  setView,
  locked,
  collapsed,
  hiddenTabs,
  onPinNav,
}: {
  view: View;
  setView: (v: View) => void;
  locked: boolean;
  collapsed: boolean;
  hiddenTabs: Record<LockableTab, boolean>;
  onPinNav: (v: View) => void;
}) {
  const { settings, update } = useSettings();
  const activeDownloads = useActiveDownloadCount();
  const t = useT();
  const isItemVisible = (item: CanonicalNavItem) => {
    if (item.view === "vod" && !settings.showPlaylistsTab) return false;
    if (item.hideKey && settings.hideContent[item.hideKey]) return false;
    if (locked && item.parentalKey && hiddenTabs[item.parentalKey]) return false;
    return true;
  };
  const mac = hasNativeDesktopUx();
  const pins = sanitizeMacPins(settings.macPinnedViews);
  const visiblePrimary = (mac ? MAC_PRIMARY_VIEWS.map((id) => NAV_ITEMS.find((it) => it.id === id)!) : PRIMARY_NAV_ITEMS).filter(isItemVisible);
  const categories = MAC_EXPLORE_VIEWS.map((id) => NAV_ITEMS.find((it) => it.id === id)!).filter(isItemVisible);
  const visibleCategories = categories.filter((item) => isExploreView(view) || pins.includes(item.view));
  const labelFor = (item: CanonicalNavItem) => mac && item.id === "discover" ? "Explore" : mac && item.id === "library" ? "My library" : item.label;
  const ref = useRef<HTMLElement>(null);
  const [overflow, setOverflow] = useState<{ top: boolean; bottom: boolean }>({
    top: false,
    bottom: false,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const syncOverflow = () => {
      const top = el.scrollTop > 4;
      const bottom = el.scrollHeight - el.scrollTop - el.clientHeight > 4;
      setOverflow((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
    };
    syncOverflow();
    el.addEventListener("scroll", syncOverflow, { passive: true });
    const ro = new ResizeObserver(syncOverflow);
    ro.observe(el);
    window.addEventListener("resize", syncOverflow);
    return () => {
      el.removeEventListener("scroll", syncOverflow);
      ro.disconnect();
      window.removeEventListener("resize", syncOverflow);
    };
  }, []);

  const scrollDown = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ top: 112, behavior: "smooth" });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <nav
        ref={ref}
        aria-label={t("Navigation")}
        className={`flex flex-1 flex-col overflow-y-auto pt-2 pb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          collapsed ? "px-3" : "px-3 min-[960px]:px-3.5"
        }`}
      >
        <div className="flex flex-col gap-1">
          {visiblePrimary.map((item) => {
            const isLibraryRow = mac && item.id === "library";
            const showsDownloadsBadge =
              activeDownloads > 0 && (mac ? isLibraryRow : item.view === "downloads");
            return (
              <NavItem
                key={item.id}
                {...item}
                label={labelFor(item)}
                collapsed={collapsed}
                badge={!collapsed && showsDownloadsBadge ? activeDownloads : undefined}
                dot={collapsed && mac && activeDownloads > 0 && isLibraryRow}
                active={
                  view === item.view ||
                  (mac && item.id === "discover" && isExploreView(view)) ||
                  (isLibraryRow && isLibraryView(view))
                }
                onClick={() => setView(item.view)}
              />
            );
          })}
        </div>
        {mac && (isExploreView(view) || pins.length > 0) && (
          <div className="mt-4 flex flex-col gap-1">
            {!collapsed && (
              <div className="hidden items-center justify-between px-3 pb-1.5 pt-1 min-[960px]:flex">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-subtle/85">
                  {t(isExploreView(view) ? "Explore categories" : "Pinned categories")}
                </p>
                {pins.length > 0 && (
                  <span className="rounded-full bg-elevated px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-subtle">
                    {pins.length}
                  </span>
                )}
              </div>
            )}
            <div
              className={`flex flex-col gap-0.5 ${
                collapsed ? "" : "min-[960px]:ms-[19px] min-[960px]:border-s min-[960px]:border-edge-soft/50 min-[960px]:ps-2.5"
              }`}
            >
              {visibleCategories.map((item) => {
                const isPinned = pins.includes(item.view);
                return (
                  <div key={item.id} className="group/cat flex min-w-0 items-center gap-0.5">
                    <NavItem
                      {...item}
                      compact
                      collapsed={collapsed}
                      active={view === item.view}
                      onClick={() => setView(item.view)}
                    />
                    {!collapsed && item.id !== "discover" && (
                      <button
                        type="button"
                        aria-pressed={isPinned}
                        aria-label={t(isPinned ? "Unpin {name}" : "Pin {name}", { name: t(item.label) })}
                        onClick={() =>
                          update({
                            macPinnedViews: isPinned
                              ? pins.filter((id) => id !== item.view)
                              : [...pins, item.view],
                          })
                        }
                        className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-[opacity,color,background-color] duration-150 hover:bg-elevated focus-visible:opacity-100 min-[960px]:flex ${
                          isPinned
                            ? "text-ink opacity-90"
                            : "text-ink-subtle opacity-0 hover:text-ink group-hover/cat:opacity-100 group-focus-within/cat:opacity-100"
                        }`}
                      >
                        <Pin size={13} strokeWidth={2} fill={isPinned ? "currentColor" : "none"} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div data-tauri-drag-region className="py-3">
          <div className="mx-2 h-px bg-gradient-to-r from-transparent via-edge-soft/60 to-transparent" />
        </div>
        <div className="flex flex-col gap-1">
          {COLLECTION_NAV_ITEMS.filter((item) => (!mac || item.id === "settings") && isItemVisible(item)).map((item) => {
            const gated = !!item.pinGated && locked;
            return (
              <NavItem
                key={item.id}
                {...item}
                gated={gated}
                collapsed={collapsed}
                active={view === item.view}
                onClick={() => (gated ? onPinNav(item.view) : setView(item.view))}
              />
            );
          })}
        </div>
        <div data-tauri-drag-region className="min-h-2 flex-1" />
      </nav>
      {overflow.top && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-canvas to-transparent" />
      )}
      {overflow.bottom && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-canvas via-canvas/85 to-transparent" />
          <button
            type="button"
            onClick={scrollDown}
            aria-label={t("chrome.scrollForMore")}
            className="absolute bottom-1 left-1/2 flex h-4 w-7 -translate-x-1/2 items-center justify-center text-ink-subtle/55 transition-colors hover:text-ink-muted"
          >
            <ChevronDown size={11} strokeWidth={2} />
          </button>
        </>
      )}
    </div>
  );
}

export function NavItem({
  render,
  label,
  active,
  onClick,
  gated,
  collapsed,
  compact = false,
  badge,
  dot = false,
  view,
}: {
  render: (active: boolean) => ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  gated?: boolean;
  collapsed?: boolean;
  compact?: boolean;
  badge?: number;
  dot?: boolean;
  view: View;
}) {
  const t = useT();
  const translatedLabel = t(label);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(event) => setFocused(event.currentTarget.matches(":focus-visible"))}
      onBlur={() => setFocused(false)}
      data-vayra-nav={view}
      data-active={active ? "" : undefined}
      aria-current={active ? "page" : undefined}
      aria-label={gated ? t("chrome.lockedRequiresPin", { label: translatedLabel }) : translatedLabel}
      title={gated ? t("chrome.lockedShort", { label: translatedLabel }) : translatedLabel}
      className={`group/nav relative flex items-center justify-center transition-colors duration-150 ${
        compact
          ? "min-h-[38px] min-w-0 flex-1 gap-2.5 rounded-lg text-[13.5px] tracking-[-0.005em] [&_svg]:h-[17px] [&_svg]:w-[17px]"
          : "h-11 gap-3.5 rounded-xl text-[14.5px] tracking-[-0.01em] [&_svg]:h-[20px] [&_svg]:w-[20px]"
      } ${
        collapsed ? "" : compact ? "min-[960px]:justify-start min-[960px]:px-2.5" : "min-[960px]:justify-start min-[960px]:px-3.5"
      } ${
        collapsed
          ? active
            ? "text-ink"
            : "text-ink-muted hover:text-ink"
          : active
            ? "bg-elevated text-ink font-medium"
            : "text-ink-muted hover:bg-elevated/45 hover:text-ink"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute start-0 top-1/2 w-[2.5px] -translate-y-1/2 rounded-full bg-ink transition-[height,opacity] duration-200 motion-reduce:transition-none ${
          active ? (compact ? "h-4 opacity-100" : "h-5 opacity-100") : "h-0 opacity-0"
        }`}
      />
      <span
        data-nav-icon=""
        className={`relative inline-flex shrink-0 ${gated ? "opacity-70" : active ? "text-ink" : "text-ink-muted group-hover/nav:text-ink"}`}
      >
        {render(hovered || focused)}
        {dot && (
          <span
            aria-hidden="true"
            className="absolute -end-1 -top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-canvas"
          />
        )}
        {gated && (
          <span className="absolute -bottom-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-canvas text-ink-subtle ring-1 ring-edge">
            <Lock size={9} strokeWidth={2.4} />
          </span>
        )}
      </span>
      {!collapsed && (
        <span className="hidden min-w-0 flex-1 truncate text-start min-[960px]:inline">
          {translatedLabel}
        </span>
      )}
      {!collapsed && badge != null && badge > 0 && (
        <span className="hidden shrink-0 rounded-full bg-ink/12 px-2 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-ink min-[960px]:inline-flex">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
