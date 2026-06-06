import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/lib/settings";
import {
  usePlaybackPositionGated,
  usePlaybackBufferedGated,
  setSeekHovering,
} from "@/lib/player/playback-clock";
import { useTrickplayState } from "@/lib/trickplay";
import { ThumbPreview } from "@/components/player/thumb-preview";
import { SeekBarVisual } from "./seek-bar-visual";
import { fmtTime } from "./transport-utils";

const BUFFER_PAD_SEC = 4;

export function SeekBar({
  durationSec,
  onSeek,
  active,
}: {
  durationSec: number;
  onSeek: (s: number) => void;
  active: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const { settings } = useSettings();
  const { active: trickplayActive, bufferedOnly } = useTrickplayState();
  const position = usePlaybackPositionGated(active);
  const buffered = usePlaybackBufferedGated(active);
  const dur = durationSec || 1;
  const value = scrub ?? pending ?? position;
  const pct = Math.max(0, Math.min(1, value / dur)) * 100;
  const bufferedPct = Math.max(0, Math.min(1, (position + buffered) / dur)) * 100;

  useEffect(() => {
    setSeekHovering(hover != null || scrub != null);
  }, [hover, scrub]);
  useEffect(() => () => setSeekHovering(false), []);
  useEffect(() => {
    if (pending == null) return;
    if (Math.abs(position - pending) < 0.75) setPending(null);
  }, [pending, position]);

  const fromEvent = (clientX: number): number => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return 0;
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return x * dur;
  };

  const onMove = (e: React.PointerEvent) => {
    setHover(fromEvent(e.clientX));
    if (scrub != null) setScrub(fromEvent(e.clientX));
  };
  const onLeave = () => setHover(null);
  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setPending(null);
    setScrub(fromEvent(e.clientX));
  };
  const onUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (scrub != null) {
      onSeek(scrub);
      setPending(scrub);
    }
    setScrub(null);
  };

  return (
    <div className="pointer-events-auto group/seek relative h-12">
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onPointerDown={onDown}
        onPointerUp={onUp}
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 cursor-pointer"
      >
        <SeekBarVisual
          settings={settings}
          pct={pct}
          bufferedPct={bufferedPct}
          scrubbing={scrub != null}
          hovered={hover != null}
        />
        {hover != null &&
          (trickplayActive ? (
            <ThumbPreview
              time={hover}
              dur={dur}
              canFetch={!bufferedOnly || hover <= position + Math.max(0, buffered - BUFFER_PAD_SEC)}
            />
          ) : (
            <div
              className="pointer-events-none absolute -top-9 -translate-x-1/2 rounded-md border border-white/10 bg-black/90 px-2 py-1 font-mono text-[12px] font-semibold tabular-nums text-white shadow-lg backdrop-blur-md"
              style={{ left: `${(hover / dur) * 100}%` }}
            >
              {fmtTime(hover)}
            </div>
          ))}
      </div>
    </div>
  );
}
