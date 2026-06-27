import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { findActiveCue } from "@/lib/subtitles/parser";
import { evaluateAnchors, type SyncAnchor } from "@/lib/subtitles/text-sync";
import { usePlaybackPosition } from "@/lib/player/playback-clock";
import { useT } from "@/lib/i18n";
import { TextSyncList } from "./text-sync-list";
import { SyncTransport } from "@/components/player/transport/sync-transport";

export type TextSyncApi = {
  syncMode: "idle" | "active";
  mode: "easy" | "normal";
  phase: "listen" | "review";
  anchors: SyncAnchor[];
  activeAnchorSlot: 0 | 1;
  pendingCues: import("@/lib/subtitles/parser").SubCue[] | null;
  previewOffset: number;
  baseOffset: number;
  dirty: boolean;
  sourceFormat: "srt" | "vtt";
  enterSync: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  pickCue: (cueIndex: number) => void;
  selectSlot: (slot: 0 | 1) => void;
  setMode: (mode: "easy" | "normal") => void;
  seekTo: (cueIndex: number) => void;
  undo: () => void;
  nudgeOffset: (deltaSec: number) => void;
  save: (confirmSingleAnchor?: boolean) => Promise<{ ok: true } | { ok: false; reason: string }>;
  discard: () => void;
  exitSync: () => void;
};

export function TextSyncOverlay({
  api,
  playing,
  onPlayPause,
}: {
  api: TextSyncApi;
  playing: boolean;
  onPlayPause: () => void;
}) {
  const t = useT();
  const position = usePlaybackPosition();
  const cues = api.pendingCues;
  const [confirmSingle, setConfirmSingle] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const activeIndex = useMemo(() => {
    if (!cues) return null;
    const cue = findActiveCue(cues, position);
    return cue ? cues.indexOf(cue) : null;
  }, [cues, position]);

  const warnings = useMemo(() => evaluateAnchors(api.anchors), [api.anchors]);
  const canSave = api.mode === "easy" ? api.previewOffset !== api.baseOffset : api.anchors.length > 0;

  if (api.syncMode !== "active" || !cues) return null;

  const handleSaveClick = () => {
    if (api.mode === "normal" && api.anchors.length === 1) {
      setConfirmSingle(true);
    } else {
      void api.save(true);
    }
  };

  const handleExit = () => {
    if (api.dirty) {
      setConfirmDiscard(true);
    } else {
      api.discard();
    }
  };

  return (
    <div className="absolute bottom-[90px] end-5 top-[90px] z-[70] flex w-[440px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/80 shadow-[0_32px_80px_rgba(0,0,0,0.7)] backdrop-blur-2xl animate-in slide-in-from-right duration-300">
      <SyncTransport
        mode={api.mode}
        playing={playing}
        anchorCount={api.anchors.length}
        canUndo={api.anchors.length > 0}
        canSave={canSave}
        previewOffset={api.previewOffset}
        onPlayPause={onPlayPause}
        onNudge={api.nudgeOffset}
        onUndo={api.undo}
        onSave={handleSaveClick}
        onExit={handleExit}
      />

      <div className="flex flex-col gap-1.5 border-b border-edge-soft/50 bg-canvas/30 px-4 py-2.5">
        <div className="flex rounded-xl bg-white/5 p-0.5">
          {(["easy", "normal"] as const).map((m) => (
            <button
              key={m}
              onClick={() => api.setMode(m)}
              className={`flex-1 rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                api.mode === m ? "bg-white/15 text-white" : "text-white/45 hover:text-white/70"
              }`}
            >
              {m === "easy" ? t("Easy") : t("Normal")}
            </button>
          ))}
        </div>
        <span className="px-1 text-[11px] leading-snug text-white/45">
          {api.mode === "easy"
            ? t("Tap a line to jump there, then nudge until the subtitles match what you hear.")
            : t("Play, then tap the line you hear at two spots (one early, one late) to fix drift.")}
        </span>
      </div>

      {api.mode === "normal" && (
      <div className="flex flex-col gap-2 border-b border-edge-soft/50 bg-canvas/30 px-4 py-3">
        <span className="text-[12px] font-semibold text-white/80">
          {t("Anchor Selection")}
        </span>
        <div className="flex gap-2">

        {[0, 1].map((slot) => {
          const anchor = api.anchors[slot];
          const isActive = api.activeAnchorSlot === slot;
          return (
            <button
              key={slot}
              onClick={() => api.selectSlot(slot as 0 | 1)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition-colors ${
                isActive ? "bg-accent/25 ring-1 ring-accent/50 text-white" : "bg-white/8 text-white/55 hover:bg-white/12"
              }`}
            >
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/20 text-[9px] font-bold">
                {slot + 1}
              </span>
              {anchor ? (
                <span className="font-mono tabular-nums">
                  Δ {anchor.delta >= 0 ? "+" : ""}{anchor.delta.toFixed(1)}s
                </span>
              ) : (
                <span>—</span>
              )}
            </button>
          );
        })}
        </div>
      </div>
      )}

      {(warnings.gapSec != null || warnings.slopePct != null) && (
        <div className="flex flex-col gap-0.5 border-b border-amber-300/20 bg-amber-400/10 px-4 py-1.5">
          {warnings.gapSec != null && (
            <span className="text-[11px] font-medium leading-snug text-amber-200">
              {t("These two points are very close ({n}s apart). Pick one near the start and one near the end, or the timing can drift at the edges.", { n: warnings.gapSec.toFixed(1) })}
            </span>
          )}
          {warnings.slopePct != null && (
            <span className="text-[11px] font-medium leading-snug text-amber-200">
              {t("That is a large correction ({n}%). One of the two points may be off, double-check them.", { n: warnings.slopePct.toFixed(1) })}
            </span>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 bg-canvas/15">
        <TextSyncList
          cues={cues}
          activeIndex={activeIndex}
          anchors={api.anchors}
          onPick={api.mode === "easy" ? api.seekTo : api.pickCue}
        />
      </div>

      {confirmSingle && (
        <ConfirmDialog
          title={t("Save with one anchor?")}
          body={t("You picked only one anchor. This applies a constant shift (no FPS-drift correction). Continue?")}
          confirmLabel={t("Save")}
          onCancel={() => setConfirmSingle(false)}
          onConfirm={async () => {
            setConfirmSingle(false);
            await api.save(true);
          }}
        />
      )}

      {confirmDiscard && (
        <ConfirmDialog
          title={t("Discard sync?")}
          body={t("You have unsaved anchors. They will be lost.")}
          confirmLabel={t("Discard")}
          danger
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            setConfirmDiscard(false);
            api.discard();
          }}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div
      className="absolute inset-0 z-[80] flex items-center justify-center bg-black/72 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="flex w-[300px] max-w-[86%] flex-col gap-3 rounded-2xl border border-edge bg-elevated/97 p-5 shadow-[0_24px_60px_-22px_rgba(0,0,0,0.85)] animate-in zoom-in-95 fade-in duration-200 backdrop-blur-xl">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        <p className="text-[13px] leading-relaxed text-ink-muted">{body}</p>
        <div className="mt-1 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-full bg-raised px-4 py-2 text-[12.5px] font-semibold text-ink transition-colors hover:bg-canvas/55"
          >
            {t("Cancel")}
          </button>
          <button
            onClick={onConfirm}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-semibold text-white transition-colors ${
              danger ? "bg-danger hover:bg-danger/85" : "bg-accent hover:bg-accent/85"
            }`}
          >
            {danger ? <X size={13} strokeWidth={2.6} /> : <Check size={13} strokeWidth={2.6} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
