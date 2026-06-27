import { Star } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { ResultPoster } from "./result-poster";
import { useView } from "@/lib/view";

export function MetaList({
  title,
  items,
  onClose,
}: {
  title: string;
  items: Meta[];
  onClose: () => void;
}) {
  const { openMeta } = useView();
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.2em] text-ink-subtle">
        {title}
      </h3>
      <div className="grid gap-1">
        {items.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              openMeta(m);
              onClose();
            }}
            className="group flex items-center gap-4 rounded-2xl border border-transparent px-3 py-2.5 text-start transition-colors hover:border-edge-soft hover:bg-elevated/50 active:scale-[0.997]"
          >
            <div className="h-[96px] w-[64px] shrink-0 overflow-hidden rounded-xl shadow-[0_6px_16px_-8px_rgba(0,0,0,0.55)] ring-1 ring-edge-soft">
              <ResultPoster id={m.id} poster={m.poster} className="block h-full w-full" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-[16px] font-semibold text-ink">{m.name}</span>
              <div className="flex items-center gap-2 text-[12.5px] text-ink-muted">
                {m.releaseInfo && <span>{m.releaseInfo}</span>}
                {m.releaseInfo && m.imdbRating && (
                  <span aria-hidden className="h-1 w-1 rounded-full bg-ink-subtle" />
                )}
                {m.imdbRating && (
                  <span className="flex items-center gap-1 text-ink">
                    <Star size={11} className="fill-accent text-accent" />
                    {m.imdbRating}
                  </span>
                )}
              </div>
              {m.description && (
                <span className="line-clamp-2 text-[12.5px] leading-snug text-ink-subtle">
                  {m.description}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
