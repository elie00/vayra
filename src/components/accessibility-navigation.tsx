import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const VIEW_LABEL_KEYS: Record<string, string> = {
  home: "nav.home",
  discover: "nav.discover",
  movies: "nav.movies",
  shows: "nav.shows",
  anime: "nav.anime",
  kids: "nav.kids",
  live: "nav.live",
  sports: "nav.sports",
  vod: "nav.playlists",
  calendar: "nav.calendar",
  library: "nav.library",
  downloads: "nav.downloads",
  addons: "nav.addons",
  settings: "nav.settings",
  collections: "Collections",
  queue: "Discovery Queue",
  stats: "Stats",
};

export function announcementForView(kind: string, title: string | undefined, translate: Translate): string {
  if (title?.trim()) return title.trim();
  const key = VIEW_LABEL_KEYS[kind];
  return key ? translate(key) : kind.replaceAll("-", " ");
}

export function focusCurrentContent(root: Document = document): boolean {
  const target = root.querySelector<HTMLElement>(
    "[data-vayra-player], .contents main, .contents [role='main']",
  );
  if (!target) return false;
  const hadTabIndex = target.hasAttribute("tabindex");
  if (!hadTabIndex) target.tabIndex = -1;
  target.focus({ preventScroll: true });
  if (!hadTabIndex) {
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
  }
  return true;
}

export function AccessibilityNavigation() {
  const t = useT();
  const { topKind, meta, picker, player } = useView();
  const [announcement, setAnnouncement] = useState("");
  const title = player?.meta.name ?? picker?.meta.name ?? meta?.name;
  const label = useMemo(
    () => announcementForView(topKind, title, t),
    [t, title, topKind],
  );

  useEffect(() => {
    setAnnouncement("");
    const timer = window.setTimeout(() => setAnnouncement(label), 40);
    return () => window.clearTimeout(timer);
  }, [label]);

  return (
    <>
      <a
        href="#vayra-current-content"
        onClick={(event) => {
          event.preventDefault();
          focusCurrentContent();
        }}
        className="fixed start-4 top-3 z-[320] -translate-y-20 rounded-xl border border-edge bg-canvas px-4 py-2.5 text-[13px] font-semibold text-ink shadow-[0_16px_40px_-18px_rgba(0,0,0,0.8)] outline-none transition-transform duration-200 focus:translate-y-0 focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
      >
        {t("Skip to current content")}
      </a>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </>
  );
}
