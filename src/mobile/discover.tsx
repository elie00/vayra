import { useEffect, useRef, useState } from "react";
import { PickCard } from "@/components/pick-card";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { MobileHeroCard } from "@/mobile/home";

// Mobile-first Discover (Apple Sports card model). Rendered from `Discover` in
// src/views/discover.tsx when isMobileTauri(); all state + data hooks still run
// in the original component and their already-computed values arrive as props.
//
// The desktop feed is a vertical stack of horizontal rails. On mobile that maps
// to: horizontally scrollable section chips (one per rail) + a single featured
// card + a 3-column poster grid of the selected rail, with the rail's existing
// infinite scroll (loadMore / ensureLoaded) wired to a bottom sentinel.
//
// Usage (inside Discover, right before the desktop return):
//   if (isMobileTauri())
//     return (
//       <MobileDiscover
//         featured={featured}
//         rails={visibleRails}
//         deduped={deduped}
//         loadMore={loadMore}
//         ensureLoaded={ensureLoaded}
//       />
//     );
export function MobileDiscover({
  featured,
  rails,
  deduped,
  loadMore,
  ensureLoaded,
}: {
  featured: Meta[];
  rails: { key: string; title: string }[];
  deduped: Record<string, Meta[] | null>;
  loadMore: (railId: string) => void;
  ensureLoaded: (railId: string) => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<string>(rails[0]?.key ?? "");

  // Keep the selected chip valid if the rail set changes (taste / settings).
  useEffect(() => {
    if (rails.length === 0) return;
    if (!rails.some((r) => r.key === selected)) setSelected(rails[0].key);
  }, [rails, selected]);

  // Load the selected rail on demand (mirrors the desktop Rail's ensureLoaded).
  useEffect(() => {
    if (selected) ensureLoaded(selected);
  }, [selected, ensureLoaded]);

  const items = (selected ? deduped[selected] : null) ?? null;
  const featuredItem = featured[0];

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !selected) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore(selected);
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [selected, loadMore, items?.length]);

  return (
    <main className="flex-1 overflow-y-auto px-4 pt-[calc(5rem+var(--harbor-status-bar,1.75rem))]">
      <div className="flex flex-col gap-5 pt-2">
        {rails.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {rails.map((r) => {
              const on = r.key === selected;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setSelected(r.key)}
                  aria-pressed={on}
                  className={`shrink-0 rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors ${
                    on ? "bg-ink text-canvas" : "bg-elevated/60 text-ink-muted"
                  }`}
                >
                  {t(r.title)}
                </button>
              );
            })}
          </div>
        )}

        {featuredItem && <MobileHeroCard meta={featuredItem} label="Featured" />}

        {items === null ? (
          <div className="grid grid-cols-3 gap-2.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-elevated/40" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            {items.map((m, i) => (
              <PickCard key={`${m.id}-${i}`} meta={m} />
            ))}
          </div>
        )}

        <div ref={sentinelRef} className="h-4" />
      </div>
    </main>
  );
}
