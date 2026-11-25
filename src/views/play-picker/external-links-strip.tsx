import { ExternalLink } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { ScoredStream } from "@/lib/streams/types";
import type { ExternalLinkItem } from "./stream-presentation";

export function ExternalLinksStrip({
  links,
  onOpen,
}: {
  links: ExternalLinkItem[];
  onOpen: (stream: ScoredStream) => void;
}) {
  const t = useT();

  if (links.length === 0) return null;

  return (
    <section
      aria-label={t("Open elsewhere")}
      className="mt-2 flex flex-col gap-2 border-t border-edge-soft/45 pt-3"
    >
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
        {t("Open elsewhere")}
      </h3>
      <div className="flex flex-wrap gap-2">
        {links.map((item, idx) => {
          const showLabel =
            item.label &&
            item.label.trim().toLowerCase() !== item.addonName.trim().toLowerCase();
          return (
            <button
              key={`${item.addonName}-${item.url}-${idx}`}
              type="button"
              onClick={() => onOpen(item.stream)}
              title={item.url}
              className="inline-flex max-w-full items-center gap-2 rounded-xl bg-elevated/45 px-3 py-2 text-start text-[12.5px] text-ink-muted ring-1 ring-edge-soft/60 transition-colors hover:bg-elevated hover:text-ink"
            >
              <span className="truncate font-medium text-ink">{item.addonName}</span>
              {showLabel && (
                <span className="truncate text-ink-subtle">{item.label}</span>
              )}
              <ExternalLink
                size={13}
                strokeWidth={2}
                className="shrink-0 text-ink-subtle"
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
