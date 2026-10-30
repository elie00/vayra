import { useEffect, useState } from "react";
import { ArrowLeft, Menu } from "lucide-react";
import { BackChrome } from "@/chrome/back-chrome";
import { HarborMark } from "@/components/icons/harbor-mark";
import { ProfileAvatar } from "@/chrome/sidebar/profile-chip";
import { useT } from "@/lib/i18n";
import { useActiveKid, useProfiles } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { MobileTogetherButton } from "@/mobile/together-sheet";
import { setPlusOpen } from "@/mobile/shell";

// Streaming-app header for the mobile tab-level views, after HBO Max: the menu
// (shows, movies, anime, sports, categories…) and a small VAYRA mark on the left,
// Watch Together and the profile, which opens the settings, on the right. Search
// is a tab; the header turns solid once the page scrolls under it.
export function MobileHeader({ raised = false }: { raised?: boolean }) {
  const t = useT();
  const { topKind, setView, openSettings } = useView();
  const { activeProfile } = useProfiles();
  const { settings } = useSettings();
  const scrolled = useScrolledPast(8, topKind);

  return (
    <header
      data-vayra-topbar
      className={`fixed inset-x-0 top-0 ${raised ? "z-[130]" : "z-[55]"} transition-[background-color,backdrop-filter] duration-300 ${
        scrolled ? "bg-canvas/92 backdrop-blur-xl" : "bg-gradient-to-b from-canvas/85 via-canvas/40 to-transparent"
      }`}
    >
      <div className="flex h-16 items-center gap-1 ps-2 pe-2">
        <button
          type="button"
          onClick={() => setPlusOpen(true)}
          aria-label={t("Open menu")}
          className="flex h-12 w-12 items-center justify-center rounded-full text-ink transition-colors active:bg-elevated"
        >
          <Menu size={24} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          onClick={() => setView("home")}
          aria-label={t("chrome.harborHome")}
          className="me-auto flex items-center gap-1.5 text-ink"
        >
          <HarborMark className="h-[18px] w-[18px] shrink-0" />
          {/* The Mac sets its wordmark in the system sans (San Francisco); Switzer is its match here. */}
          <span className="font-sans text-[17px] font-semibold leading-none tracking-tight">VAYRA</span>
        </button>
        <MobileTogetherButton />
        {/* The profile, far right as in streaming apps; it opens the settings. */}
        <button
          type="button"
          onClick={() => openSettings()}
          aria-label={t("nav.settings")}
          className="flex h-12 w-12 items-center justify-center rounded-full transition-transform active:scale-90"
        >
          {/* No profile-colour ring: a coloured circle round the icon read as Stremio. */}
          <span className="scale-[0.8] rounded-full ring-1 ring-white/15">
            <ProfileAvatar profile={activeProfile} fallbackAvatar={settings.harborAvatar} compact ring={false} />
          </span>
        </button>
      </div>
    </header>
  );
}

/**
 * The top bar of a stacked page (a title, a person, a list) on a phone, as a
 * Material 3 top app bar: a 48dp round Back button over the artwork, and a bar
 * that turns solid once the page scrolls under it, instead of a floating
 * "Back" pill that ran over the content.
 */
export function MobileBackBar() {
  const t = useT();
  const { goBack, topKind, meta } = useView();
  const kid = useActiveKid();
  const scrolled = useScrolledPast(48, topKind);
  if (kid) {
    return (
      <header data-vayra-topbar className="fixed inset-x-0 top-0 z-[55]">
        <div className="flex h-16 items-center px-4">
          <BackChrome />
        </div>
      </header>
    );
  }
  const label = topKind === "downloads" && meta ? t("Back to {title}", { title: meta.name }) : t("common.back");
  return (
    <header
      data-vayra-topbar
      className={`pointer-events-none fixed inset-x-0 top-0 z-[55] transition-[background-color] duration-300 ${scrolled ? "bg-canvas/92 backdrop-blur-xl" : ""}`}
    >
      <div className="flex h-16 items-center px-2">
        <button
          type="button"
          onClick={goBack}
          aria-label={label}
          className={`pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full text-ink transition-[transform,background-color] active:scale-90 ${
            scrolled ? "" : "bg-black/45 backdrop-blur-md"
          }`}
        >
          <ArrowLeft size={22} strokeWidth={2.2} className="dir-icon" />
        </button>
      </div>
    </header>
  );
}

// True once the page's vertical scroller is past `threshold`. Scroll events
// don't bubble, so this listens in the capture phase; horizontal rails have no
// vertical overflow and are ignored. A new view starts back at the top.
function useScrolledPast(threshold: number, viewKey: string): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    setScrolled(false);
    const onScroll = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight) return;
      setScrolled(el.scrollTop > threshold);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, [threshold, viewKey]);
  return scrolled;
}
