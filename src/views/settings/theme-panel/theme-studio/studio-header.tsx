import { Eye, X } from "lucide-react";

export function StudioHeader({
  name,
  onCancel,
  onHidePanel,
}: {
  name: string;
  onCancel: () => void;
  onHidePanel: () => void;
}) {
  return (
    <header
      data-tauri-drag-region
      className="flex h-14 shrink-0 items-center gap-2 border-b border-edge-soft bg-surface/80 px-3 backdrop-blur-md"
    >
      <button
        type="button"
        onClick={onCancel}
        aria-label="Close studio"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
      >
        <X size={18} strokeWidth={2.4} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-subtle">
          Theme studio
        </span>
        <span className="truncate text-[14px] font-semibold text-ink">
          {name || "Untitled theme"}
        </span>
      </div>
      <button
        type="button"
        onClick={onHidePanel}
        aria-label="Preview full app"
        title="Preview (Ctrl/Cmd + P)"
        className="flex h-10 items-center gap-1.5 rounded-lg border border-edge-soft px-3.5 text-[13px] font-semibold text-ink-muted transition-colors hover:border-edge hover:text-ink"
      >
        <Eye size={16} strokeWidth={2.2} />
        Preview
      </button>
    </header>
  );
}
