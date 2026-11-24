import { ArrowLeft, ChevronDown, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import type { PlayEpisode } from "@/lib/view";

export function PickerHeader({
  meta,
  episode,
  onBack,
  onRefresh,
  refreshing = false,
}: {
  meta: Meta;
  episode?: PlayEpisode;
  onBack: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const t = useT();
  const { settings } = useSettings();
  return (
    <header className="flex flex-col gap-3">
      <div className="mb-1">
        <div
          className={`relative flex items-center gap-2.5 ${
            settings.pickerRefreshNextToBack ? "justify-start" : "justify-between"
          }`}
        >
          <button
            type="button"
            onClick={onBack}
            className="vayra-chrome-pill h-9 gap-2 ps-3 pe-4 text-[13px] font-medium"
          >
            <ArrowLeft size={15} strokeWidth={2.1} className="dir-icon" />
            {t("Back")}
          </button>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              title={t("Refresh sources")}
              aria-label={t("Refresh sources")}
              className="vayra-chrome-pill h-9 shrink-0 gap-2 ps-3.5 pe-4 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-55"
            >
              <RefreshCw size={14} strokeWidth={2.1} className={refreshing ? "animate-spin" : ""} />
              {t("Refresh")}
            </button>
          )}
        </div>
      </div>
      {episode ? (
        <>
          <p className="vayra-kicker">
            {meta.name} · {t("Season")} {episode.imdbSeason ?? episode.season} · {t("Episode")} {String(episode.imdbEpisode ?? episode.episode).padStart(2, "0")}
          </p>
          <h1 className="font-display text-[clamp(34px,4vw,52px)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
            {episode.name || t("Episode {n}", { n: episode.episode })}
          </h1>
          {episode.overview && <CollapsibleOverview text={episode.overview} />}
        </>
      ) : (
        <>
          {meta.releaseInfo && (
            <p className="vayra-kicker">
              {meta.releaseInfo}
              {meta.genres?.length ? ` · ${meta.genres.slice(0, 2).join(" · ")}` : ""}
            </p>
          )}
          <h1 className="font-display text-[clamp(36px,4.2vw,56px)] font-semibold leading-[1.04] tracking-[-0.03em] text-ink">
            {meta.name}
          </h1>
        </>
      )}
      <div className="vayra-header-rule mt-1" aria-hidden="true" />
    </header>
  );
}

function CollapsibleOverview({ text }: { text: string }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const check = () => setTruncated(el.scrollHeight - el.clientHeight > 2);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [text, expanded]);
  return (
    <div className="mt-2 max-w-2xl">
      <p
        ref={ref}
        className={`text-[14.5px] leading-relaxed text-ink-muted ${expanded ? "" : "line-clamp-2"}`}
      >
        {text}
      </p>
      {(truncated || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-subtle transition-colors hover:text-ink"
        >
          {expanded ? t("Show less") : t("View more")}
          <ChevronDown
            size={14}
            strokeWidth={2.4}
            className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </div>
  );
}
