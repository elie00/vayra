import type { LocalEntry } from "@/lib/local-library";

// Shared props threaded from the Local tab into each card (movie card and show
// group card) for selection mode and the per-card fix-match / export actions.
export type LocalCardProps = {
  selectMode: boolean;
  selected: Set<string>;
  onToggleSelect: (ids: string[]) => void;
  onFixMatch: (entries: LocalEntry | LocalEntry[]) => void;
  onExport: (entries: LocalEntry | LocalEntry[]) => void;
  onOpenDetail: (entry: LocalEntry) => void;
};

// A small circular hover-action button used on library cards.
export function CardIconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={title}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-full bg-canvas/70 text-ink opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.4)] backdrop-blur-sm transition-all duration-200 hover:bg-canvas/90 group-hover:opacity-100"
    >
      {children}
    </button>
  );
}
