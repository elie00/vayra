import { useT } from "@/lib/i18n";
import { Play, Star } from "lucide-react";
import type { SearchResults } from "@/lib/search";
import { ResultPoster } from "./result-poster";
import { useLocalizedOverview } from "@/lib/use-localized-overview";
import { useView } from "@/lib/view";

export function TopMatch({
  match,
  onClose,
}: {
  match: NonNullable<SearchResults["topMatch"]>;
  onClose: () => void;
}) {
  const t = useT();
  const { openMeta } = useView();
  const yearTxt = match.meta.releaseInfo ?? "";
  const rating = match.voteAverage && match.voteAverage > 0 ? match.voteAverage.toFixed(1) : null;
  const synopsis = (useLocalizedOverview(match.meta) ?? "").trim();

  const handleOpen = () => {
    openMeta(match.meta);
    onClose();
  };

  return (
    <section className="vayra-stage">
      {match.backdrop && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage: `url(${match.backdrop})`,
            backgroundSize: "cover",
            backgroundPosition: "center 30%",
            opacity: 0.28,
            filter: "blur(32px) saturate(1.2)",
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-canvas/95 via-canvas/86 to-canvas/60 rtl:bg-gradient-to-l" />

      <button
        type="button"
        onClick={handleOpen}
        className="group flex w-full items-stretch gap-6 p-6 text-start transition-colors duration-200 hover:bg-white/[0.015] sm:gap-7 sm:p-7"
      >
        <div className="relative w-[152px] shrink-0 overflow-hidden rounded-xl shadow-[0_20px_50px_-18px_rgba(0,0,0,0.75)] ring-1 ring-white/10 sm:w-[168px]">
          <ResultPoster
            id={match.meta.id}
            poster={match.meta.poster}
            className="block h-full w-full transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
          <div className="flex flex-col">
            <span className="vayra-kicker text-accent">
              {t("Top match")}
            </span>
            <h2
              className="mt-1.5 font-display text-[clamp(28px,3vw,42px)] font-semibold leading-[1.06] tracking-[-0.025em] text-ink"
            >
              {match.meta.name}
            </h2>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13.5px] text-ink-muted">
              <span className="rounded-md border border-edge-soft/75 bg-canvas/60 px-2 py-0.5 text-[12px] font-medium text-ink">
                {t(match.kind === "movie" ? "Movie" : "Series")}
              </span>
              {yearTxt && (
                <>
                  <Dot />
                  <span>{yearTxt}</span>
                </>
              )}
              {rating && (
                <>
                  <Dot />
                  <span className="flex items-center gap-1 font-medium text-ink">
                    <Star size={12} className="fill-accent text-accent" />
                    {rating}
                  </span>
                </>
              )}
            </div>
            {synopsis && (
              <p className="mt-3.5 line-clamp-3 max-w-[60ch] text-[14px] leading-relaxed text-ink-muted">
                {synopsis}
              </p>
            )}
          </div>
          <div className="mt-5 inline-flex min-h-10 max-w-max items-center gap-2 self-start rounded-xl bg-ink px-5 py-2 text-[13.5px] font-semibold text-canvas transition-opacity duration-150 group-hover:opacity-90">
            <Play size={14} className="fill-current" strokeWidth={0} />
            {t("Open")}
          </div>
        </div>
      </button>
    </section>
  );
}

function Dot() {
  return <span aria-hidden className="h-1 w-1 rounded-full bg-ink-subtle" />;
}
