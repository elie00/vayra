import { Star } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { useLocalizedOverview } from "@/lib/use-localized-overview";
import { ResultPoster } from "./result-poster";
import { useView } from "@/lib/view";

function MetaRow({ m, onClose, index }: { m: Meta; onClose: () => void; index?: number }) {
  const { openMeta } = useView();
  const description = useLocalizedOverview(m);
  const staggered = index != null;
  return (
    <button
      type="button"
      onClick={() => {
        openMeta(m);
        onClose();
      }}
      style={staggered ? { animationDelay: `${Math.min(index, 8) * 55}ms` } : undefined}
      className={`group flex min-w-0 items-center gap-4 rounded-xl border border-transparent px-3 py-2.5 text-start transition-[background-color,border-color] duration-150 hover:border-edge-soft/75 hover:bg-surface/85 ${
        staggered ? "animate-ai-reveal" : ""
      }`}
    >
      <div className="h-[90px] w-[60px] shrink-0 overflow-hidden rounded-lg shadow-[0_8px_20px_-8px_rgba(0,0,0,0.65)] ring-1 ring-white/10">
        <ResultPoster id={m.id} poster={m.poster} className="block h-full w-full transition-transform duration-200 group-hover:scale-[1.03]" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[15.5px] font-semibold tracking-[-0.01em] text-ink">{m.name}</span>
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
        {description && (
          <span className="line-clamp-2 text-[12.5px] leading-snug text-ink-subtle">
            {description}
          </span>
        )}
      </div>
    </button>
  );
}

export function MetaList({
  title,
  items,
  onClose,
  stagger = false,
}: {
  title?: string;
  items: Meta[];
  onClose: () => void;
  stagger?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="min-w-0">
      {title && (
        <h3 className="vayra-kicker mb-3">
          {title}
        </h3>
      )}
      <div className="grid min-w-0 gap-1">
        {items.map((m, i) => (
          <MetaRow key={m.id} m={m} onClose={onClose} index={stagger ? i : undefined} />
        ))}
      </div>
    </section>
  );
}
