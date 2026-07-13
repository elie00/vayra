import { useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { HostSourceBanner } from "@/components/host-source-banner";
import type { Meta } from "@/lib/cinemeta";
import type { Addon } from "@/lib/addons";
import type { ScoredStream } from "@/lib/streams/types";
import type { SourceDescriptor } from "@/lib/together/protocol";
import { useT } from "@/lib/i18n";
import type { PlayEpisode } from "@/lib/view";
import { BackdropLayer } from "@/views/play-picker/backdrop-layer";
import { CinematicLoader } from "@/views/play-picker/cinematic-loader";
import { PickerEmptyLadder } from "@/views/play-picker/picker-empty-ladder";
import { StremioLayout } from "@/views/play-picker/stremio-layout";
import type { usePipelineResult } from "@/views/play-picker/use-pipeline-result";

type PipelineResult = ReturnType<typeof usePipelineResult>["result"];

// Mobile-first play picker (Apple pulled-up SHEET). Rendered from `PlayPicker`
// in src/views/play-picker.tsx when isMobileTauri(), right before its main
// desktop return — the auto-play flow, pick handler and every error/option modal
// stay as early returns in PlayPicker (they are already fixed-inset centered
// cards that fit mobile), so this component only re-skins the main "browse
// sources" screen as a bottom sheet. Every value below is computed in PlayPicker
// and passed through; no pick logic is re-implemented here.
//
// Usage (inside PlayPicker, right before the desktop return):
//   if (isMobileTauri())
//     return (
//       <MobilePlayPicker
//         meta={meta}
//         episode={episode}
//         onBack={backToDetail}
//         onRefresh={refresh}
//         refreshing={loading}
//         backdropSrc={backdropSrc}
//         addonsSettled={addonsSettled}
//         hasStreams={!!filteredPicker && filteredPicker.all.length > 0}
//         streams={displayStreams}
//         addons={addons}
//         pipelineDone={pipelineDone}
//         loadingAddonCount={Math.max(0, (addons?.length ?? 0) - addonCount)}
//         failedStreams={failedStreams}
//         preserveOrder={addonOrderMode || !!hostMatch}
//         matchFor={hostMatch ? matchFor : undefined}
//         onPlay={playManually}
//         hostSource={hostSourceForMedia}
//         isDownload={isDownload}
//         stubBanner={stubBanner}
//         resolveError={resolveError}
//         engineWarming={engineWarming}
//         result={result}
//         streamIds={streamIds}
//         debridCount={debrids.length}
//         addonCount={addonCount}
//         allCount={allCount}
//         rawCount={rawCount}
//         strictMode={strictMode}
//         forceShowAll={forceShowAll}
//         onOpenLibrarySettings={() => openSettings("library")}
//         onOpenStreamingSettings={() => openSettings("streaming")}
//         onShowAll={() => setForceShowAll(true)}
//         onSearchWider={() => { if (strictMode) setStrictMode(false); else setForceShowAll(true); }}
//       />
//     );
export function MobilePlayPicker({
  meta,
  episode,
  onBack,
  onRefresh,
  refreshing,
  backdropSrc,
  addonsSettled,
  hasStreams,
  streams,
  addons,
  pipelineDone,
  loadingAddonCount,
  failedStreams,
  preserveOrder,
  matchFor,
  onPlay,
  hostSource,
  isDownload,
  stubBanner,
  resolveError,
  engineWarming,
  result,
  streamIds,
  debridCount,
  addonCount,
  allCount,
  rawCount,
  strictMode,
  forceShowAll,
  onOpenLibrarySettings,
  onOpenStreamingSettings,
  onShowAll,
  onSearchWider,
}: {
  meta: Meta;
  episode?: PlayEpisode;
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  backdropSrc?: string;
  addonsSettled: boolean;
  hasStreams: boolean;
  streams: ScoredStream[];
  addons: Addon[] | null;
  pipelineDone: boolean;
  loadingAddonCount: number;
  failedStreams: Set<ScoredStream>;
  preserveOrder: boolean;
  matchFor?: (s: ScoredStream) => "same" | "close" | null;
  onPlay: (stream: ScoredStream) => void;
  hostSource: SourceDescriptor | null;
  isDownload: boolean;
  stubBanner: string | null;
  resolveError: string | null;
  engineWarming: boolean;
  result: PipelineResult;
  streamIds: string[] | null;
  debridCount: number;
  addonCount: number;
  allCount: number;
  rawCount: number;
  strictMode: boolean;
  forceShowAll: boolean;
  onOpenLibrarySettings: () => void;
  onOpenStreamingSettings: () => void;
  onShowAll: () => void;
  onSearchWider: () => void;
}) {
  const t = useT();
  const title = episode
    ? episode.name || t("Episode {n}", { n: episode.episode })
    : meta.name;
  const subtitle = episode
    ? `${meta.name} · S${episode.imdbSeason ?? episode.season}E${String(
        episode.imdbEpisode ?? episode.episode,
      ).padStart(2, "0")}`
    : meta.releaseInfo || "";

  // Drag-down-to-close on the sheet handle.
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startY.current == null) return;
    setDrag(Math.max(0, e.clientY - startY.current));
  };
  const onPointerUp = () => {
    if (drag > 90) onBack();
    startY.current = null;
    setDrag(0);
  };

  const showLoader = !addonsSettled && !hasStreams;

  return (
    <main className="absolute inset-0 z-50 overflow-hidden bg-black/40">
      <BackdropLayer src={backdropSrc} />

      {/* Exposed backdrop area — tap to dismiss. */}
      <button
        type="button"
        aria-label={t("common.back")}
        onClick={onBack}
        className="absolute inset-x-0 top-0 h-[18vh] w-full"
      />

      {/* Bottom sheet */}
      <section
        style={drag > 0 ? { transform: `translateY(${drag}px)` } : undefined}
        className="absolute inset-x-0 bottom-0 top-[16vh] flex flex-col rounded-t-3xl bg-canvas ring-1 ring-edge-soft/70 shadow-[0_-16px_48px_-12px_rgba(0,0,0,0.7)]"
      >
        {/* Drag handle */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-3 active:cursor-grabbing"
        >
          <span className="h-1.5 w-11 rounded-full bg-ink-subtle/40" />
        </div>

        {/* Header */}
        <header className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-1">
          <div className="min-w-0">
            {subtitle && (
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-subtle">
                {subtitle}
              </p>
            )}
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight text-ink">
              {title}
            </h1>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label={t("Refresh sources")}
            className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-edge-soft bg-elevated/70 ps-3 pe-4 text-[13px] font-semibold text-ink-muted transition-colors active:bg-elevated disabled:opacity-60"
          >
            <RefreshCw size={15} strokeWidth={2.4} className={refreshing ? "animate-spin" : ""} />
            {t("Refresh")}
          </button>
        </header>

        {/* Scrollable sources */}
        <div className="flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-1">
          <div className="flex flex-col gap-4">
            {hostSource && <HostSourceBanner source={hostSource} />}

            {isDownload && (
              <div className="rounded-2xl border border-edge-soft bg-elevated/60 px-4 py-3 text-[13px] text-ink-muted">
                {t("Choose a source to save offline. You can track progress on the Downloads page.")}
              </div>
            )}

            {stubBanner && (
              <div className="rounded-2xl border border-info/30 bg-info/10 px-4 py-3 text-[13px] text-info">
                {stubBanner}
              </div>
            )}

            {showLoader && <CinematicLoader meta={meta} />}

            <PickerEmptyLadder
              meta={meta}
              result={result}
              addonsSettled={addonsSettled}
              pipelineDone={pipelineDone}
              streamIds={streamIds}
              debridCount={debridCount}
              addonCount={addonCount}
              allCount={allCount}
              rawCount={rawCount}
              strictMode={strictMode}
              forceShowAll={forceShowAll}
              onOpenLibrarySettings={onOpenLibrarySettings}
              onOpenStreamingSettings={onOpenStreamingSettings}
              onShowAll={onShowAll}
              onSearchWider={onSearchWider}
            />

            {hasStreams && (
              <StremioLayout
                streams={streams}
                addons={addons}
                pipelineDone={pipelineDone}
                loadingAddonCount={loadingAddonCount}
                failedStreams={failedStreams}
                preserveOrder={preserveOrder}
                matchFor={matchFor}
                onPlay={onPlay}
              />
            )}

            {resolveError && engineWarming && (
              <div className="flex items-center gap-3 rounded-2xl border border-edge-soft/60 bg-elevated/40 px-4 py-3.5 text-[13px] text-ink-muted">
                <Loader2 size={16} className="shrink-0 animate-spin text-ink-subtle" />
                <span>{resolveError}</span>
              </div>
            )}
            {resolveError && !engineWarming && (
              <div className="rounded-2xl border border-danger/30 bg-danger/15 px-4 py-3.5 text-[13px] text-ink">
                {resolveError}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
