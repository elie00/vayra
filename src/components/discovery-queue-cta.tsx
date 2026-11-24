import { ArrowRight, Sparkles } from "lucide-react";
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
  const peek = items.slice(0, 3);

  if (peek.length === 0) return null;

  const backdropSrc = peek[0]?.meta.background ?? peek[0]?.meta.poster;

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
        className="vayra-surface group relative flex flex-col items-start justify-between gap-6 overflow-hidden px-6 py-6 text-start transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-edge sm:flex-row sm:items-center sm:px-8 sm:py-7 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        {backdropSrc && (
          <img
            src={backdropSrc}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover opacity-[0.12] blur-xl"
          />
        )}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(105deg, color-mix(in srgb, var(--color-surface) 94%, transparent) 0%, color-mix(in srgb, var(--color-surface) 78%, transparent) 58%, color-mix(in srgb, var(--color-canvas) 62%, transparent) 100%)",
          }}
        />

        <div className="relative z-10 flex max-w-[46ch] flex-col gap-2.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            <Sparkles size={12} strokeWidth={2} aria-hidden="true" />
            <span>{t("Personalized deck")}</span>
          </span>
          <h3 className="font-display text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[24px]">
            {t("Explore your queue")}
          </h3>
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            {t("Swipe through tailored picks and refine what VAYRA recommends next.")}
          </p>
          <span className="mt-1 inline-flex min-h-10 items-center gap-2 self-start rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-canvas transition-opacity duration-150 group-hover:opacity-90">
            <span>{t("Start browsing")}</span>
            <ArrowRight
              size={15}
              strokeWidth={2}
              className="dir-icon transition-transform duration-200 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none"
            />
          </span>
        </div>

        <div
          aria-hidden="true"
          className="relative z-10 hidden h-[148px] w-[240px] shrink-0 items-center justify-end sm:flex"
        >
          {peek.map((item, i) => {
            const offsets = [
              "end-[112px] -rotate-6 scale-[0.9] opacity-80 group-hover:-rotate-8 group-hover:end-[120px]",
              "end-[56px] rotate-0 scale-[0.96] opacity-95 z-10 group-hover:-translate-y-1",
              "end-0 rotate-6 scale-100 z-20 group-hover:rotate-8 group-hover:-translate-y-1.5",
            ];
            return (
              <div
                key={item.meta.id}
                className={`absolute bottom-0 w-[94px] overflow-hidden rounded-xl border border-edge-soft/85 bg-canvas shadow-[0_18px_36px_-14px_rgba(0,0,0,0.8)] transition-[transform,inset,opacity] duration-300 motion-reduce:transition-none ${offsets[i] ?? ""}`}
              >
                <Poster
                  src={rpdbPoster(settings.rpdbKey, item.meta.id, item.meta.poster ?? item.meta.background)}
                  seed={item.meta.id}
                  ratio="portrait"
                  className="rounded-none"
                />
              </div>
            );
          })}
        </div>
      </button>
    </section>
  );
}
