import { ArrowRight } from "lucide-react";
import type { FeedItem } from "@/lib/feed";
import { useT } from "@/lib/i18n";
import { rpdbPoster } from "@/lib/providers/rpdb";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { Poster } from "./poster";

export function DiscoveryQueueCta({ items }: { items: FeedItem[] }) {
  const { settings } = useSettings();
  const { openQueue } = useView();
  const t = useT();
  const peek = items.slice(0, 6);

  if (peek.length === 0) return null;

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[26px]">
          {t("Your Discovery Queue")}
        </h2>
        <span className="rounded-full border border-edge-soft/70 bg-surface/85 px-3 py-1 text-[11px] font-semibold uppercase tabular-nums tracking-[0.16em] text-ink-subtle">
          {t("{count} picks ready", { count: items.length })}
        </span>
      </div>
      <button
        type="button"
        onClick={openQueue}
        className="group relative flex h-[160px] items-stretch overflow-hidden rounded-2xl border border-edge-soft/80 bg-surface text-start shadow-[0_14px_38px_-22px_rgba(0,0,0,0.75)] transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-edge motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <div className="absolute inset-0 grid grid-cols-6 gap-px">
          {peek.map((item, i) => (
            <div
              key={item.meta.id}
              className="relative overflow-hidden"
              style={{ opacity: 0.45 + i * 0.06 }}
            >
              <Poster
                src={rpdbPoster(settings.rpdbKey, item.meta.id, item.meta.background ?? item.meta.poster)}
                seed={item.meta.id}
                ratio="landscape"
                className="absolute inset-0 rounded-none"
              />
            </div>
          ))}
        </div>
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, oklch(0.10 0.02 260 / 0.85) 0%, oklch(0.10 0.02 260 / 0.35) 50%, oklch(0.10 0.02 260 / 0.85) 100%)",
          }}
        />
        <div className="relative flex w-full items-center justify-center px-12">
          <div className="flex h-14 w-full max-w-[560px] items-center gap-3 rounded-full border border-ink/15 bg-canvas/85 px-8 transition-[background-color,border-color,color,opacity,box-shadow] duration-300 group-hover:bg-canvas group-hover:shadow-[0_22px_44px_-18px_rgba(0,0,0,0.7)]">
            <span className="flex-1 text-center font-display text-[18px] font-medium tracking-tight text-ink">
              {t("Explore your queue")}
            </span>
            <ArrowRight
              size={18}
              className="dir-icon shrink-0 text-ink-subtle transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 group-hover:text-ink"
            />
          </div>
        </div>
      </button>
    </section>
  );
}
