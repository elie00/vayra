import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { BackToTop } from "@/components/back-to-top";
import { PickCard } from "@/components/pick-card";
import type { Meta } from "@/lib/cinemeta";
import { layoutHasGlobalBack } from "@/lib/theme";
import { useScrollMemory, useView, type GridSpec } from "@/lib/view";

const PAGE_CAP = 40;

export function GridView({ grid }: { grid: GridSpec }) {
  const { goBack } = useView();
  const scrollRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [metas, setMetas] = useState<Meta[]>(grid.initial ?? []);
  const [page, setPage] = useState(grid.initial?.length ? 1 : 0);
  const [done, setDone] = useState(false);
  const loadingRef = useRef(false);
  useScrollMemory(`grid:${grid.title}`, scrollRef);

  useEffect(() => {
    if (done) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadingRef.current) return;
        loadingRef.current = true;
        const next = page + 1;
        grid
          .fetcher(next)
          .then((batch) => {
            setPage(next);
            if (batch.length === 0 || next >= PAGE_CAP) {
              setDone(true);
              return;
            }
            setMetas((prev) => {
              const seen = new Set(prev.map((m) => m.id));
              const fresh = batch.filter((m) => !seen.has(m.id));
              if (fresh.length === 0) setDone(true);
              return [...prev, ...fresh];
            });
          })
          .catch(() => setDone(true))
          .finally(() => {
            loadingRef.current = false;
          });
      },
      { rootMargin: "900px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [grid, page, done]);

  return (
    <main ref={scrollRef} className="absolute inset-0 z-30 overflow-y-auto bg-canvas">
      <div className="flex w-full flex-col gap-8 px-12 pb-24 pt-24">
        <div className="flex items-center gap-4">
          {!layoutHasGlobalBack() && (
            <button
              onClick={goBack}
              aria-label="Back"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-elevated text-ink-muted transition-colors hover:text-ink"
            >
              <ArrowLeft size={18} strokeWidth={2.2} />
            </button>
          )}
          <h1 className="font-display text-[30px] font-medium leading-none tracking-tight text-ink">
            {grid.title}
          </h1>
          <span className="text-[14px] text-ink-subtle">{metas.length} titles</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-8">
          {metas.map((m, i) => (
            <PickCard key={`${m.id}-${i}`} meta={m} />
          ))}
        </div>
        {!done && <div ref={sentinelRef} className="h-24" />}
        {done && metas.length === 0 && (
          <p className="py-20 text-center text-[14px] text-ink-subtle">Nothing here yet.</p>
        )}
      </div>
      <BackToTop scrollRef={scrollRef} />
    </main>
  );
}
