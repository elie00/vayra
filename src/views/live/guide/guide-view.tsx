import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { computeTvgIdCounts, epgProgramsForChannel } from "@/lib/iptv/epg-resolver";
import { channelHasCatchup } from "@/lib/iptv/catchup";
import type { EpgIndex, EpgProgram, IptvChannel } from "@/lib/iptv/types";
import { useLazyVisible } from "../hooks/use-lazy-visible";
import { GuideChannelCell } from "./guide-channel-cell";
import { GuideProgramBlock } from "./guide-program-block";
import { GuideTimeRuler } from "./guide-time-ruler";
import {
  CHANNEL_COL_PX,
  PX_PER_MS,
  ROW_HEIGHT_PX,
  RULER_HEIGHT_PX,
  WINDOW_HOURS,
  WINDOW_PX,
  clampDuration,
  startOfWindow,
} from "./guide-utils";

const COL_MIN = 140;
const COL_MAX = 560;
const COL_KEY = "harbor.guide.channel-col-px";

function loadColPx(): number {
  try {
    const v = parseInt(localStorage.getItem(COL_KEY) ?? "", 10);
    if (Number.isFinite(v) && v >= COL_MIN && v <= COL_MAX) return v;
  } catch {}
  return CHANNEL_COL_PX;
}

export function GuideView({
  channels: allChannels,
  epg,
  nowMs,
  onPlay,
  onPlayCatchup,
  resetKey,
}: {
  channels: IptvChannel[];
  epg: EpgIndex | null;
  nowMs: number;
  onPlay: (ch: IptvChannel) => void;
  onPlayCatchup?: (ch: IptvChannel, program: EpgProgram) => void;
  resetKey: string;
}) {
  const { visible: channels, sentinelRef, hasMore } = useLazyVisible(allChannels, resetKey);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledRef = useRef(false);
  const tvgIdCounts = useMemo(() => computeTvgIdCounts(allChannels), [allChannels]);

  const [colPx, setColPx] = useState<number>(loadColPx);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(COL_KEY, String(colPx));
    } catch {}
  }, [colPx]);
  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startW: colPx };
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setColPx(Math.min(COL_MAX, Math.max(COL_MIN, d.startW + (e.clientX - d.startX))));
  };
  const onResizeUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const { windowStart, windowEnd, windowMinutes } = useMemo(() => {
    const start = startOfWindow(nowMs, 60);
    const minutes = WINDOW_HOURS * 60;
    return { windowStart: start, windowEnd: start + minutes * 60_000, windowMinutes: minutes };
  }, [Math.floor(nowMs / (15 * 60_000))]);

  useEffect(() => {
    if (scrolledRef.current) return;
    if (channels.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const nowLeftInGrid = (nowMs - windowStart) * PX_PER_MS;
    const viewport = el.clientWidth - colPx;
    el.scrollLeft = Math.max(0, nowLeftInGrid - viewport / 3);
    scrolledRef.current = true;
  }, [channels.length, windowStart, nowMs]);

  const nowOffsetPx = (nowMs - windowStart) * PX_PER_MS;
  const showNowLine = nowMs >= windowStart && nowMs < windowEnd;

  return (
    <div className="-mx-6 flex flex-col">
      {!epg && (
        <div className="mx-6 mb-3 flex items-center gap-2 rounded-xl border border-edge-soft/55 bg-elevated/70 px-4 py-2 text-[12.5px] text-ink-muted">
          <Loader2 size={13} className="animate-spin text-ink-subtle" />
          Loading program listings… channels are ready to play in the meantime.
        </div>
      )}
      <div
        ref={scrollRef}
        className="relative overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div
          className="relative"
          style={{
            width: colPx + WINDOW_PX,
            minHeight: RULER_HEIGHT_PX + channels.length * ROW_HEIGHT_PX,
          }}
        >
          <div className="sticky top-0 z-30 flex bg-surface">
            <div
              className="sticky left-0 z-40 flex items-center gap-2 border-b border-r border-edge-soft/60 bg-surface px-3"
              style={{
                width: colPx,
                height: RULER_HEIGHT_PX,
                flex: `0 0 ${colPx}px`,
              }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-subtle">
                Channel
              </span>
              <div
                onPointerDown={onResizeDown}
                onPointerMove={onResizeMove}
                onPointerUp={onResizeUp}
                role="separator"
                aria-orientation="vertical"
                title="Drag to resize the channel column"
                className="absolute right-0 top-0 z-50 h-full w-2.5 cursor-col-resize touch-none transition-colors hover:bg-accent/40 active:bg-accent/60"
              />
            </div>
            <GuideTimeRuler
              windowStart={windowStart}
              windowMinutes={windowMinutes}
              todayMs={nowMs}
            />
          </div>
          {channels.map((ch, i) => {
            const programs = epgProgramsForChannel(ch, epg, tvgIdCounts) ?? [];
            return (
              <div
                key={ch.id}
                data-scroll-anchor={`channel-${ch.id}`}
                className="relative flex"
                style={{
                  height: ROW_HEIGHT_PX,
                  contentVisibility: "auto",
                  containIntrinsicSize: `${ROW_HEIGHT_PX}px`,
                }}
              >
                <GuideChannelCell channel={ch} onPlay={onPlay} index={i} width={colPx} />
                <div
                  className="relative border-b border-edge-soft/30"
                  style={{ width: WINDOW_PX, height: ROW_HEIGHT_PX }}
                >
                  {programs.length === 0 && (
                    <div className="flex h-full items-center px-3 text-[11.5px] text-ink-subtle">
                      No program info
                    </div>
                  )}
                  {programs.map((p) => {
                    const clip = clampDuration(p.startMs, p.endMs, windowStart, windowEnd);
                    if (!clip) return null;
                    const replayable =
                      p.endMs <= nowMs && !!onPlayCatchup && channelHasCatchup(ch);
                    return (
                      <GuideProgramBlock
                        key={`${p.startMs}-${p.endMs}-${p.title}`}
                        program={p}
                        windowStart={windowStart}
                        rowTop={0}
                        rowHeight={ROW_HEIGHT_PX}
                        nowMs={nowMs}
                        replayable={replayable}
                        onClick={() =>
                          replayable ? onPlayCatchup!(ch, p) : onPlay(ch)
                        }
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          {showNowLine && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute z-[10] w-px bg-danger shadow-[0_0_8px_var(--color-danger)]"
                style={{
                  left: colPx + nowOffsetPx,
                  top: RULER_HEIGHT_PX,
                  bottom: 0,
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute z-[10] flex h-5 items-center rounded-md bg-danger px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-canvas"
                style={{
                  left: colPx + nowOffsetPx - 22,
                  top: RULER_HEIGHT_PX + 4,
                }}
              >
                Now
              </div>
            </>
          )}
        </div>
      </div>
      {hasMore ? (
        <div ref={sentinelRef} className="flex h-12 items-center justify-center">
          <div className="flex items-center gap-2 text-[12px] text-ink-subtle">
            <Loader2 size={13} className="animate-spin" />
            Loading more channels ({channels.length.toLocaleString()} of {allChannels.length.toLocaleString()})
          </div>
        </div>
      ) : allChannels.length > channels.length ? (
        <div className="mx-6 mt-3 mb-2 rounded-xl border border-edge-soft/55 bg-elevated/60 px-4 py-2.5 text-center text-[12px] text-ink-subtle">
          Showing first {channels.length.toLocaleString()} of {allChannels.length.toLocaleString()} channels. Use search or a category to narrow down.
        </div>
      ) : null}
    </div>
  );
}
