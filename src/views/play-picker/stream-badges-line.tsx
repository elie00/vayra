import { Info, Zap } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { ScoredStream } from "@/lib/streams/types";
import { isRoughSource } from "./picker-utils";
import {
  formatStreamLanguages,
  type ReleaseMeta,
  type SeederHealth,
} from "./stream-presentation";

function qualityTone(stream: ScoredStream): string {
  if (isRoughSource(stream)) {
    return "bg-danger/15 text-danger ring-1 ring-danger/30";
  }
  if (stream.resolution === "4K") {
    return "bg-ink/12 text-ink ring-1 ring-edge";
  }
  if (stream.resolution === "1080p") {
    return "bg-raised text-ink ring-1 ring-edge-soft";
  }
  return "bg-canvas/70 text-ink-muted ring-1 ring-edge-soft/75";
}

function qualityLabel(stream: ScoredStream): string | null {
  if (isRoughSource(stream)) {
    return stream.source;
  }
  return stream.resolution || null;
}

export function QualityPill({ stream }: { stream: ScoredStream }) {
  const label = qualityLabel(stream);
  if (!label) return null;
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[11px] font-bold uppercase leading-none tracking-[0.04em] tabular-nums ${qualityTone(stream)}`}
    >
      {label}
    </span>
  );
}

type TechTag = { label: string; highlight?: boolean };

function collectTechTags(stream: ScoredStream): TechTag[] {
  const tags: TechTag[] = [];
  if (stream.hdrFormat) {
    const label =
      stream.hdrFormat === "DV+HDR10" ? "DV" : stream.hdrFormat;
    tags.push({ label, highlight: label === "DV" || label === "HDR10+" });
  }
  if (stream.audio.codec !== "Other") {
    tags.push({
      label: stream.audio.codec,
      highlight: stream.audio.codec === "Atmos" || stream.audio.codec === "TrueHD",
    });
  }
  if (stream.remux) {
    tags.push({ label: "REMUX", highlight: true });
  } else if (
    stream.source === "BluRay" ||
    stream.source === "WEB-DL" ||
    stream.source === "WEBRip"
  ) {
    tags.push({ label: stream.source });
  }
  if (stream.codec === "HEVC" || stream.codec === "AV1") {
    tags.push({ label: stream.codec });
  }
  return tags;
}

export function TechFormatBadges({ stream }: { stream: ScoredStream }) {
  const tags = collectTechTags(stream);
  if (tags.length === 0) return null;
  return (
    <>
      {tags.map((tag) => (
        <span
          key={tag.label}
          className={`inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[10.5px] font-semibold leading-none tracking-[0.03em] ${
            tag.highlight
              ? "bg-raised/80 text-ink ring-1 ring-edge-soft"
              : "bg-canvas/65 text-ink-muted ring-1 ring-edge-soft/60"
          }`}
        >
          {tag.label}
        </span>
      ))}
    </>
  );
}

export function LanguageBadges({
  stream,
  preferredLanguages,
  maxPrimary = 2,
}: {
  stream: ScoredStream;
  preferredLanguages?: string[];
  maxPrimary?: number;
}) {
  const t = useT();
  const formatted = formatStreamLanguages(stream, preferredLanguages, maxPrimary);
  if (formatted.primary.length === 0) return null;

  const display =
    formatted.overflowCount > 0
      ? `${formatted.primary.join(" · ")} +${formatted.overflowCount}`
      : formatted.primary.join(" · ");
  const fullList = formatted.all.join(" · ");

  return (
    <span
      title={fullList}
      aria-label={t("Languages: {list}", { list: formatted.all.join(", ") })}
      className={`inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[10.5px] font-semibold leading-none tracking-[0.04em] tabular-nums ${
        formatted.matchesPreferred
          ? "bg-ink/10 text-ink ring-1 ring-edge"
          : "bg-canvas/55 text-ink-muted ring-1 ring-edge-soft/60"
      }`}
    >
      {display}
    </span>
  );
}

const SEEDER_DOT_CLASS: Record<SeederHealth, string> = {
  good: "bg-success",
  ok: "bg-amber-400",
  low: "bg-danger",
};

const SEEDER_TEXT_CLASS: Record<SeederHealth, string> = {
  good: "text-ink",
  ok: "text-ink-muted",
  low: "text-ink-subtle",
};

export function StreamMetrics({
  meta,
  columns = true,
}: {
  meta: ReleaseMeta;
  /** When true, aligns Size and Seeders in fixed tabular columns for list rows. */
  columns?: boolean;
}) {
  const t = useT();
  const hasSize = Boolean(meta.sizeLabel);
  const hasAvailability = meta.isCached || meta.seeders != null;
  if (!hasSize && !hasAvailability) return null;

  return (
    <div
      className={`flex shrink-0 items-center tabular-nums ${
        columns ? "gap-3" : "gap-2.5"
      }`}
    >
      <span
        className={`text-right text-[12.5px] font-medium text-ink-muted ${
          columns ? "w-[70px]" : ""
        }`}
      >
        {meta.sizeLabel ?? ""}
      </span>
      <span
        className={`flex items-center justify-end gap-1.5 text-[12.5px] ${
          columns ? "w-[72px]" : ""
        }`}
      >
        {meta.isCached ? (
          <span
            title={
              meta.seeders != null
                ? `${t("Cached")} · ${t("{count} seeds", { count: meta.seeders })}`
                : t("Cached")
            }
            className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-semibold text-success ring-1 ring-success/25"
          >
            <Zap size={10} fill="currentColor" strokeWidth={0} aria-hidden />
            {t("Cached")}
          </span>
        ) : meta.seeders != null && meta.seederHealth != null ? (
          <span
            title={t("{count} seeds", { count: meta.seeders })}
            className={`inline-flex items-center gap-1.5 font-medium ${SEEDER_TEXT_CLASS[meta.seederHealth]}`}
          >
            <span
              aria-hidden
              className={`h-2 w-2 shrink-0 rounded-full ${SEEDER_DOT_CLASS[meta.seederHealth]}`}
            />
            <span>{meta.seeders}</span>
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function ScoreInfoButton({
  open,
  onToggle,
  className = "",
}: {
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={t("Why this score?")}
      title={t("Why this score?")}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
        open
          ? "bg-raised text-ink"
          : "text-ink-subtle hover:bg-canvas/60 hover:text-ink"
      } ${className}`}
    >
      <Info size={14} strokeWidth={2} />
    </button>
  );
}

export function ScoreBreakdown({
  why,
}: {
  why: Array<{ label: string; delta: number }>;
}) {
  if (why.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5 pt-1">
      {why.map((line) => (
        <li
          key={line.label}
          className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ${
            line.delta > 0
              ? "bg-success/10 text-success ring-success/25"
              : "bg-danger/10 text-danger ring-danger/25"
          }`}
        >
          <span className="tabular-nums">
            {line.delta > 0 ? `+${line.delta}` : `−${-line.delta}`}
          </span>{" "}
          {line.label}
        </li>
      ))}
    </ul>
  );
}
