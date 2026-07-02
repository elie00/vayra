import { useRef } from "react";
import { AudioMenuBody } from "@/components/player/audio-menu";
import { useFocusTrap } from "@/lib/use-focus-trap";
import type { TrackInfo } from "@/lib/player/bridge";

export type AudioModalState = {
  tracks: TrackInfo[];
  selectedId: string | null;
  delaySec: number;
  engine: "html5" | "mpv" | "exo";
};

type Props = {
  state: AudioModalState;
  onSelect: (id: string) => void;
  onDelay: (sec: number) => void;
  onClose: () => void;
};

export function AudioModal({ state, onSelect, onDelay, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
  return (
    <div
      className="fixed inset-0 flex items-end justify-end"
      style={{ background: "transparent" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Audio tracks"
        className="m-3 mb-[110px] me-[160px] flex max-h-[480px] w-[340px] flex-col overflow-hidden rounded-2xl border border-edge bg-elevated shadow-[0_24px_60px_-15px_rgba(0,0,0,0.85)] backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <AudioMenuBody
          tracks={state.tracks}
          selectedId={state.selectedId}
          delaySec={state.delaySec}
          engine={state.engine}
          onSelect={onSelect}
          onDelay={onDelay}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
