import { Laptop, Pause, Play, RotateCcw, RotateCw, Square, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtTime } from "@/components/player/transport/transport-utils";
import { emitAppFeedback } from "@/lib/app-feedback";
import type { ConnectCommand } from "@/lib/connect/host";
import { macStatusLabel, sendToMac, useLinkStatus, useMacPosition } from "@/lib/connect/link";
import { useT } from "@/lib/i18n";
import { closeMacRemote, openMacRemote, useMacRemoteOpen } from "./mac-remote";
import { useSheetDrag } from "./use-sheet-drag";

const SKIP_SEC = 10;

function useSendToMac() {
  const t = useT();
  return useCallback(
    (message: ConnectCommand) => {
      sendToMac(message).catch(() => emitAppFeedback({ kind: "error", text: t("The Mac isn't connected.") }));
    },
    [t],
  );
}

/**
 * What the paired Mac plays, above the tab bar like a mini player: play/pause
 * here, the full remote one tap away.
 */
export function MacNowPlayingBar() {
  const t = useT();
  const send = useSendToMac();
  const { mac, connected, state } = useLinkStatus();
  const position = useMacPosition(state);
  const shown = connected && !!mac && !!state;

  // Pages reserve the tab bar's height; the bar adds its own while shown.
  useEffect(() => {
    if (!shown) return;
    document.documentElement.dataset.macBar = "1";
    return () => {
      delete document.documentElement.dataset.macBar;
    };
  }, [shown]);

  if (!shown || !mac || !state) return null;
  const playing = state.status === "playing";
  const progress = state.durationSec > 0 ? Math.min(1, position / state.durationSec) : 0;

  return (
    <div className="fixed inset-x-2 bottom-[calc(4.5rem+var(--vayra-safe-bottom))] z-[89] overflow-hidden rounded-2xl border border-edge-soft/60 bg-elevated/95 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl">
      <div className="flex items-center gap-1 p-2">
        <button
          type="button"
          onClick={openMacRemote}
          aria-label={t("Open the remote for {name}", { name: mac.name })}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-start"
        >
          {state.meta.poster ? (
            <img src={state.meta.poster} alt="" className="h-11 w-8 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="flex h-11 w-8 shrink-0 items-center justify-center rounded-md bg-raised text-ink-subtle">
              <Laptop size={14} strokeWidth={2.2} />
            </span>
          )}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate type-footnote font-medium text-ink" dir="auto">{state.title}</span>
            <span className="flex min-w-0 items-center gap-1 type-caption text-ink-subtle">
              <Laptop size={11} strokeWidth={2.4} className="shrink-0" />
              <span className="truncate">{mac.name}</span>
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => send({ type: "command", action: playing ? "pause" : "play" })}
          aria-label={playing ? t("Pause") : t("Play")}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink transition-transform active:scale-90"
        >
          {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>
      </div>
      <div aria-hidden className="h-0.5 bg-edge-soft">
        <div className="h-full bg-ink" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

/** A range that reports moves as they happen and the final value once released. */
function CommitRange({
  value,
  max,
  step,
  label,
  valueText,
  onMove,
  onCommit,
}: {
  value: number;
  max: number;
  step: number;
  label: string;
  valueText: string;
  onMove: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  // The native change event fires on release (or per key step), unlike React's onChange.
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const onChange = () => commit.current(Number(input.value));
    input.addEventListener("change", onChange);
    return () => input.removeEventListener("change", onChange);
  }, []);
  return (
    <input
      ref={ref}
      type="range"
      min={0}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      aria-valuetext={valueText}
      onChange={(e) => onMove(Number(e.target.value))}
      className="h-1.5 w-full appearance-none rounded-full bg-edge-soft accent-ink"
    />
  );
}

/** The full remote for the paired Mac, as a bottom sheet over the app. */
export function MacRemoteSheet() {
  const t = useT();
  const send = useSendToMac();
  const open = useMacRemoteOpen();
  const { mac, connected, state } = useLinkStatus();
  const position = useMacPosition(state);
  const sheetRef = useRef<HTMLElement>(null);
  const drag = useSheetDrag(sheetRef, closeMacRemote, open);
  // A value being dragged, shown until the Mac reports a newer state.
  const [scrub, setScrub] = useState<{ value: number; at: number } | null>(null);
  const [volume, setVolume] = useState<{ value: number; at: number } | null>(null);
  const available = connected && !!mac && !!state;

  useEffect(() => {
    if (open && !available) closeMacRemote();
  }, [open, available]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMacRemote();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !available || !mac || !state) return null;
  const playing = state.status === "playing";
  const shownPosition = scrub && scrub.at === state.at ? scrub.value : position;
  const shownVolume = volume && volume.at === state.at ? volume.value : state.muted ? 0 : Math.min(1, state.volume);
  const duration = Math.max(state.durationSec, shownPosition);

  return (
    <div className="fixed inset-0 z-[130]">
      <button type="button" aria-label={t("common.close")} onClick={closeMacRemote} className="vayra-scrim absolute inset-0 bg-black/55" />
      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("Remote for {name}", { name: mac.name })}
        data-dragging={drag > 0 ? "" : undefined}
        style={drag > 0 ? { transform: `translateY(${drag}px)` } : undefined}
        className="vayra-sheet absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-3xl bg-canvas ring-1 ring-edge-soft/70 shadow-[0_-16px_48px_-12px_rgba(0,0,0,0.7)]"
      >
        <div aria-hidden className="flex shrink-0 justify-center pb-1 pt-3">
          <span className="h-1.5 w-11 rounded-full bg-ink-subtle/40" />
        </div>
        <div className="flex flex-col gap-6 overflow-y-auto px-5 pb-[calc(1.5rem+var(--vayra-safe-bottom))] pt-2">
          <div className="flex items-center gap-4">
            {state.meta.poster && (
              <img src={state.meta.poster} alt="" className="aspect-[2/3] w-16 shrink-0 rounded-xl object-cover" />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="type-title-3 font-semibold leading-tight text-ink" dir="auto">{state.title}</h2>
              <p className="flex min-w-0 items-center gap-1.5 type-footnote text-ink-subtle">
                <Laptop size={13} strokeWidth={2.2} className="shrink-0" />
                <span className="truncate">
                  {macStatusLabel(state.status, t)} · {mac.name}
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <CommitRange
              value={shownPosition}
              max={duration}
              step={1}
              label={t("Position")}
              valueText={`${fmtTime(shownPosition)} / ${fmtTime(duration)}`}
              onMove={(value) => setScrub({ value, at: state.at })}
              onCommit={(value) => send({ type: "command", action: "seek", position: value })}
            />
            <div className="flex justify-between type-caption tabular-nums text-ink-subtle">
              <span>{fmtTime(shownPosition)}</span>
              <span>{fmtTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-8">
            <button
              type="button"
              onClick={() => send({ type: "command", action: "skip", seconds: -SKIP_SEC })}
              aria-label={t("Back {n} seconds", { n: SKIP_SEC })}
              className="flex h-12 w-12 items-center justify-center rounded-full text-ink transition-transform active:scale-90"
            >
              <RotateCcw size={24} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => send({ type: "command", action: playing ? "pause" : "play" })}
              aria-label={playing ? t("Pause") : t("Play")}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-ink text-canvas transition-transform active:scale-95"
            >
              {playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
            </button>
            <button
              type="button"
              onClick={() => send({ type: "command", action: "skip", seconds: SKIP_SEC })}
              aria-label={t("Forward {n} seconds", { n: SKIP_SEC })}
              className="flex h-12 w-12 items-center justify-center rounded-full text-ink transition-transform active:scale-90"
            >
              <RotateCw size={24} strokeWidth={2} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {shownVolume > 0 ? (
              <Volume2 size={18} className="shrink-0 text-ink-subtle" aria-hidden />
            ) : (
              <VolumeX size={18} className="shrink-0 text-ink-subtle" aria-hidden />
            )}
            <CommitRange
              value={shownVolume}
              max={1}
              step={0.05}
              label={t("Volume")}
              valueText={`${Math.round(shownVolume * 100)}%`}
              onMove={(value) => setVolume({ value, at: state.at })}
              onCommit={(value) => send({ type: "command", action: "volume", level: value })}
            />
            <span className="w-10 shrink-0 text-end type-caption tabular-nums text-ink-subtle">
              {Math.round(shownVolume * 100)}%
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              send({ type: "command", action: "stop" });
              closeMacRemote();
            }}
            className="flex h-11 items-center justify-center gap-2 rounded-full bg-danger/15 type-callout font-semibold text-danger transition-colors hover:bg-danger/25"
          >
            <Square size={14} fill="currentColor" />
            {t("Stop on the Mac")}
          </button>
        </div>
      </section>
    </div>
  );
}
