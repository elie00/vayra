import { GalleryHorizontal, List } from "lucide-react";

export function EpisodeLayoutToggle({
  value,
  onChange,
}: {
  value: "list" | "strip";
  onChange: (v: "list" | "strip") => void;
}) {
  return (
    <div className="flex h-10 items-center gap-0.5 rounded-full border border-edge-soft bg-canvas/90 p-1">
      <button
        type="button"
        aria-label="List view"
        onClick={() => onChange("list")}
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
          value === "list" ? "bg-ink text-canvas" : "text-ink-muted hover:text-ink"
        }`}
      >
        <List size={15} strokeWidth={2.2} />
      </button>
      <button
        type="button"
        aria-label="Horizontal view"
        onClick={() => onChange("strip")}
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
          value === "strip" ? "bg-ink text-canvas" : "text-ink-muted hover:text-ink"
        }`}
      >
        <GalleryHorizontal size={15} strokeWidth={2.2} />
      </button>
    </div>
  );
}
