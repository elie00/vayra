import { useEffect, useMemo, useRef } from "react";
import type { SubCue } from "@/lib/subtitles/parser";
import type { SyncAnchor } from "@/lib/subtitles/text-sync";

export function TextSyncList({
  cues,
  activeIndex,
  anchors,
  onPick,
}: {
  cues: SubCue[];
  activeIndex: number | null;
  anchors: SyncAnchor[];
  onPick: (cueIndex: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const didInitialScroll = useRef(false);

  const anchorByIndex = useMemo(() => {
    const m = new Map<number, 1 | 2>();
    if (anchors[0]) m.set(anchors[0].cueIndex, 1);
    if (anchors[1]) m.set(anchors[1].cueIndex, 2);
    return m;
  }, [anchors]);

  useEffect(() => {
    if (!didInitialScroll.current && activeIndex != null && rowRefs.current[activeIndex]) {
      rowRefs.current[activeIndex]?.scrollIntoView({ block: "center", behavior: "auto" });
      didInitialScroll.current = true;
    }
  }, [activeIndex]);

  useEffect(() => {
    if (activeIndex == null) return;
    const el = rowRefs.current[activeIndex];
    if (!el) return;
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const margin = 80;
    if (elRect.top < containerRect.top + margin || elRect.bottom > containerRect.bottom - margin) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activeIndex]);

  return (
    <div ref={containerRef} className="flex h-full flex-col overflow-y-auto">
      {cues.map((cue, i) => {
        const isActive = i === activeIndex;
        const anchorTag = anchorByIndex.get(i);
        const base =
          "flex w-full items-start gap-2.5 border-b border-edge-soft/60 px-3.5 py-2 text-start transition-colors";
        const stateClass = anchorTag
          ? "bg-accent/15 hover:bg-accent/20"
          : isActive
            ? "bg-white/12 hover:bg-white/15"
            : "hover:bg-white/5";
        return (
          <button
            key={`${cue.start}-${i}`}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            onClick={() => onPick(i)}
            dir="auto"
            className={`${base} ${stateClass}`}
          >
            <span className="mt-0.5 shrink-0 font-mono text-[10.5px] tabular-nums text-ink-muted">
              {fmtTime(cue.start)}
            </span>
            <span className="flex-1 whitespace-pre-wrap text-[13px] leading-snug text-ink/90">
              {cue.text}
            </span>
            {anchorTag && (
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
                {anchorTag}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
