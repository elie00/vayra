import { useT } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { observe, usePageVisible } from "@/lib/visibility";
import { BigCardStack } from "./featured-banner/big-card-stack";
import { Lightbox } from "./featured-banner/lightbox";
import { SidePanel } from "./featured-banner/side-panel";
import { Dots } from "./featured-banner/stepper";
import type { LightboxState } from "./featured-banner/types";

const ROTATE_MS = 14000;

export function FeaturedBanner({ items }: { items: Meta[] }) {
  const t = useT();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const visible = usePageVisible();
  const ref = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);
  if (items.length > 0) hasLoadedRef.current = true;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observe(el, setInView);
  }, []);

  useEffect(() => {
    if (paused || lightbox || !inView || !visible || items.length < 2) return;
    const id = setInterval(() => setActive((i) => (i + 1) % items.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, lightbox, inView, visible, items.length]);

  useEffect(() => {
    if (active >= items.length && items.length > 0) setActive(items.length - 1);
  }, [items.length, active]);

  if (items.length === 0) return hasLoadedRef.current ? null : <BannerSkeleton />;

  const safeActive = Math.min(active, items.length - 1);
  const current = items[safeActive];

  const goPrev = () => setActive((i) => (i - 1 + items.length) % items.length);
  const goNext = () => setActive((i) => (i + 1) % items.length);

  return (
    <section
      ref={ref}
      className="flex flex-col gap-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[26px]">
          {t("Featured & Recommended")}
        </h2>
        <span className="text-[11.5px] font-medium tabular-nums tracking-[0.14em] text-ink-subtle">
          {String(safeActive + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 min-[1060px]:grid-cols-[minmax(0,1fr)_316px] xl:grid-cols-[minmax(0,1fr)_344px]">
        <BigCardStack items={items} active={safeActive} onPrev={goPrev} onNext={goNext} />
        <SidePanel
          items={items}
          meta={current}
          activeIndex={safeActive}
          onSelect={setActive}
          onOpenLightbox={setLightbox}
        />
      </div>

      <div className="min-[1060px]:hidden">
        <Dots count={items.length} active={safeActive} onJump={setActive} />
      </div>

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          startIndex={lightbox.startIndex}
          title={lightbox.title}
          onClose={() => setLightbox(null)}
        />
      )}
    </section>
  );
}

function BannerSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 min-[1060px]:grid-cols-[minmax(0,1fr)_316px] xl:grid-cols-[minmax(0,1fr)_344px]">
      <div className="aspect-[16/9] animate-pulse rounded-2xl border border-edge-soft/60 bg-surface/80" />
      <div className="hidden animate-pulse rounded-2xl border border-edge-soft/60 bg-surface/70 min-[1060px]:block" />
    </div>
  );
}
