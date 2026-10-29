import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { HarborMark } from "@/components/icons/harbor-mark";
import { useT } from "@/lib/i18n";
import { useSearch } from "@/lib/search-context";
import { useView, type View } from "@/lib/view";
import { MobileTogetherButton } from "@/mobile/together-sheet";

// Streaming-app header for the mobile tab-level views: the VAYRA mark, then
// search and Watch Together. Home and its Shows / Movies / Anime filters add a
// row of filter pills, as streaming apps do; the header turns solid once the
// page scrolls under it.

const FILTERS: { view: View; label: string }[] = [
  { view: "shows", label: "nav.shows" },
  { view: "movies", label: "nav.movies" },
  { view: "anime", label: "nav.anime" },
];

/** The views whose header carries the filter pills (and is taller for it). */
export function hasFilterPills(topKind: string): boolean {
  return topKind === "home" || FILTERS.some((f) => f.view === topKind);
}

export function MobileHeader({ search = true, raised = false }: { search?: boolean; raised?: boolean }) {
  const t = useT();
  const { topKind, setView } = useView();
  const { setOpen } = useSearch();
  const scrolled = useScrolledPast(8, topKind);
  const pills = hasFilterPills(topKind);
  const filtered = FILTERS.some((f) => f.view === topKind);

  return (
    <header
      data-vayra-topbar
      data-pills={pills ? "" : undefined}
      className={`fixed inset-x-0 top-0 ${raised ? "z-[130]" : "z-[55]"} transition-[background-color,backdrop-filter] duration-300 ${
        scrolled ? "bg-canvas/92 backdrop-blur-xl" : "bg-gradient-to-b from-canvas/85 via-canvas/40 to-transparent"
      }`}
    >
      <div className="flex h-14 items-center gap-1 ps-4 pe-2">
        <button
          type="button"
          onClick={() => setView("home")}
          aria-label={t("chrome.harborHome")}
          className="me-auto flex items-center gap-2 text-ink"
        >
          <HarborMark className="h-6 w-6 shrink-0" />
          <span className="font-display text-[22px] font-medium leading-none tracking-tight">VAYRA</span>
        </button>
        {search && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t("Search")}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors active:bg-elevated"
          >
            <Search size={22} strokeWidth={1.9} />
          </button>
        )}
        <MobileTogetherButton />
      </div>
      {pills && (
        <nav
          aria-label={t("Categories")}
          className="flex h-12 items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {filtered && (
            <button
              type="button"
              onClick={() => setView("home")}
              aria-label={t("Clear filter")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-edge text-ink transition-transform active:scale-95"
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          )}
          {FILTERS.map((f) => {
            const on = f.view === topKind;
            return (
              <button
                key={f.view}
                type="button"
                onClick={() => setView(f.view)}
                aria-current={on ? "page" : undefined}
                className={`flex h-9 shrink-0 items-center rounded-full px-4 text-[14px] font-medium transition-[background-color,color,transform] active:scale-95 ${
                  on ? "bg-ink text-canvas" : "border border-edge text-ink"
                }`}
              >
                {t(f.label)}
              </button>
            );
          })}
        </nav>
      )}
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
