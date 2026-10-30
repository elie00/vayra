import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { HarborMark } from "@/components/icons/harbor-mark";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import { MobileTogetherButton } from "@/mobile/together-sheet";
import { setPlusOpen } from "@/mobile/shell";

// Streaming-app header for the mobile tab-level views, after HBO Max: the menu
// (shows, movies, anime, sports, categories…) and the VAYRA mark on the left,
// Watch Together on the right. Search is a tab; the header turns solid once the
// page scrolls under it.
export function MobileHeader({ raised = false }: { raised?: boolean }) {
  const t = useT();
  const { topKind, setView } = useView();
  const scrolled = useScrolledPast(8, topKind);

  return (
    <header
      data-vayra-topbar
      className={`fixed inset-x-0 top-0 ${raised ? "z-[130]" : "z-[55]"} transition-[background-color,backdrop-filter] duration-300 ${
        scrolled ? "bg-canvas/92 backdrop-blur-xl" : "bg-gradient-to-b from-canvas/85 via-canvas/40 to-transparent"
      }`}
    >
      <div className="flex h-14 items-center gap-1 ps-2 pe-2">
        <button
          type="button"
          onClick={() => setPlusOpen(true)}
          aria-label={t("Open menu")}
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors active:bg-elevated"
        >
          <Menu size={24} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          onClick={() => setView("home")}
          aria-label={t("chrome.harborHome")}
          className="me-auto flex items-center gap-2 text-ink"
        >
          <HarborMark className="h-6 w-6 shrink-0" />
          {/* The Mac sets its wordmark in the system sans (San Francisco); Switzer is its match here. */}
          <span className="font-sans text-[22px] font-medium leading-none tracking-tight">VAYRA</span>
        </button>
        <MobileTogetherButton />
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
