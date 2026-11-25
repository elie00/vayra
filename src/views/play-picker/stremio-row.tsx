import { ArrowDownToLine, Play } from "lucide-react";
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

export function StremioRow({
  stream,
  failure,
  addonLogo: _addonLogo,
  match = null,
  onPlay,
  download = false,
  isAnime = false,
}: {
  stream: ScoredStream;
  /** Why this source failed in this picker, or null while it has not. */
  failure: string | null;
  addonLogo?: string | null;
  match?: "same" | "close" | null;
  onPlay: () => void;
  download?: boolean;
  isAnime?: boolean;
}) {
  void _addonLogo;
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
    <div
      className={`group rounded-xl ring-1 transition-colors ${
        failure != null
          ? "bg-danger/5 ring-danger/45"
          : "bg-elevated/35 ring-edge-soft/45 hover:bg-elevated/70 hover:ring-edge-soft focus-within:ring-edge"
      }`}
    >
      <div className="flex min-h-[56px] items-center gap-1.5 px-3 py-2">
        <button
          type="button"
          onClick={onPlay}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-start focus-visible:outline-none"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
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
                maxPrimary={2}
              />
              <HostMatchChip match={match} />
              {dubSub && <DubSubPill kind={dubSub} size="sm" />}
              <EditionChip stream={stream} />
            </div>
            {sublineParts.length > 0 && (
              <p
                className="truncate text-[12px] leading-snug text-ink-muted"
                title={sublineParts.join(" · ")}
              >
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
            {(meta.sizeLabel || meta.isCached || meta.seeders != null) && (
              <div className="flex items-center sm:hidden">
                <StreamMetrics meta={meta} columns={false} />
              </div>
            )}
          </div>

          <div className="hidden shrink-0 sm:flex">
            <StreamMetrics meta={meta} columns />
          </div>

          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-raised/70 text-ink-muted transition-colors group-hover:bg-ink group-hover:text-canvas group-focus-within:bg-ink group-focus-within:text-canvas"
          >
            {download ? (
              <ArrowDownToLine size={13} strokeWidth={2.4} />
            ) : (
              <Play size={12} fill="currentColor" strokeWidth={0} className="ml-0.5" />
            )}
          </span>
        </button>

        {(why.length > 0 || link) && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {why.length > 0 && (
              <ScoreInfoButton open={whyOpen} onToggle={() => setWhyOpen((v) => !v)} />
            )}
            {link && <CopyLinkButton url={link} size={13} />}
          </div>
        )}
      </div>

      {settings.fullStreamDescription && rawDescription && (
        <div className="px-3 pb-2.5">
          <p className="whitespace-pre-line rounded-lg bg-canvas/55 px-2.5 py-2 font-mono text-[11.5px] leading-relaxed text-ink-muted ring-1 ring-edge-soft/50">
            {rawDescription}
          </p>
        </div>
      )}

      {whyOpen && why.length > 0 && (
        <div className="border-t border-edge-soft/40 px-3 pb-2.5 pt-1.5">
          <ScoreBreakdown why={why} />
        </div>
      )}

      {failure != null && (
        <p className="px-3 pb-2.5 text-[12.5px] font-medium text-danger">
          {failure || t("Unavailable, try another.")}
        </p>
      )}
    </div>
  );
}
