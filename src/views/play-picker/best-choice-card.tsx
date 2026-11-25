import { ArrowDownToLine, Play, Sparkles } from "lucide-react";
import { useState } from "react";
import { DubSubPill, streamDubSub } from "@/components/dub-sub-pill";
import { HostMatchChip } from "@/components/host-match-chip";
import { CopyLinkButton, resolveStreamLink } from "@/components/player/copy-link-button";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { explainScore } from "@/lib/streams/score-reasons";
import type { ScoredStream } from "@/lib/streams/types";
import { EditionChip } from "./edition-chip";
import {
  LanguageBadges,
  QualityPill,
  ScoreBreakdown,
  ScoreInfoButton,
  StreamMetrics,
  TechFormatBadges,
} from "./stream-badges-line";
import { extractReleaseMeta } from "./stream-presentation";

export function BestChoiceCard({
  stream,
  failure,
  match = null,
  onPlay,
  download = false,
  isAnime = false,
}: {
  stream: ScoredStream;
  failure: string | null;
  match?: "same" | "close" | null;
  onPlay: () => void;
  download?: boolean;
  isAnime?: boolean;
}) {
  const t = useT();
  const { settings } = useSettings();
  const [whyOpen, setWhyOpen] = useState(false);

  const meta = extractReleaseMeta(stream);
  const dubSub = settings.showDubBadge ? streamDubSub(stream.audioLanguages, isAnime) : null;
  const link = resolveStreamLink(stream);
  const why = explainScore(stream.reasons ?? []);
  const rawDescription = stream.title?.trim() || stream.description?.trim() || "";

  const sublineParts = [meta.releaseName, meta.sourceLabel].filter(Boolean);

  return (
    <section
      aria-label={t("Best choice")}
      className={`rounded-2xl px-4 py-3.5 ring-1 transition-colors ${
        failure != null
          ? "bg-danger/5 ring-danger/45"
          : "bg-elevated/75 ring-edge"
      }`}
    >
      <div className="flex items-center justify-between gap-2 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
            <Sparkles size={12} strokeWidth={2.2} className="text-ink-muted" aria-hidden />
            {t("Best choice")}
          </span>
          <HostMatchChip match={match} />
          {dubSub && <DubSubPill kind={dubSub} size="sm" />}
          <EditionChip stream={stream} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {why.length > 0 && (
            <ScoreInfoButton open={whyOpen} onToggle={() => setWhyOpen((v) => !v)} />
          )}
          {link && <CopyLinkButton url={link} size={13} />}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {settings.showQualityBadge && (
              <>
                <QualityPill stream={stream} />
                <TechFormatBadges stream={stream} />
              </>
            )}
            <LanguageBadges
              stream={stream}
              preferredLanguages={settings.preferredLanguages}
              maxPrimary={3}
            />
          </div>
          {sublineParts.length > 0 && (
            <p className="truncate text-[12.5px] leading-snug text-ink-muted" title={sublineParts.join(" · ")}>
              {meta.releaseName && <span>{meta.releaseName}</span>}
              {meta.releaseName && meta.sourceLabel && (
                <span className="mx-1.5 text-ink-subtle" aria-hidden>
                  ·
                </span>
              )}
              {meta.sourceLabel && (
                <span className="text-ink-subtle">{meta.sourceLabel}</span>
              )}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
          <StreamMetrics meta={meta} columns={false} />
          <button
            type="button"
            onClick={onPlay}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-ink px-4 text-[13.5px] font-semibold text-canvas shadow-[0_8px_22px_-10px_rgba(0,0,0,0.65)] transition-[opacity,transform] duration-150 hover:opacity-92 active:scale-[0.98]"
          >
            {download ? (
              <ArrowDownToLine size={15} strokeWidth={2.4} aria-hidden />
            ) : (
              <Play size={14} fill="currentColor" strokeWidth={0} aria-hidden />
            )}
            {download ? t("Download") : t("Play")}
          </button>
        </div>
      </div>

      {settings.fullStreamDescription && rawDescription && (
        <p className="mt-2.5 whitespace-pre-line rounded-xl bg-canvas/55 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-ink-muted ring-1 ring-edge-soft/50">
          {rawDescription}
        </p>
      )}

      {whyOpen && why.length > 0 && (
        <div className="mt-2 border-t border-edge-soft/50 pt-2">
          <ScoreBreakdown why={why} />
        </div>
      )}

      {failure != null && (
        <p className="mt-2 text-[12.5px] font-medium text-danger">
          {failure || t("Unavailable, try another.")}
        </p>
      )}
    </section>
  );
}
