import { ChevronsLeft, ChevronsRight } from "lucide-react";

export function EpisodeNavBtn({
  direction,
  label,
  onClick,
  disabled,
  iconOnly,
}: {
  direction: "prev" | "next";
  label: string;
  onClick: () => void;
  disabled?: boolean;
  iconOnly?: boolean;
}) {
  const Icon = direction === "prev" ? ChevronsLeft : ChevronsRight;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-10 shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-reduce:transition-none ${
        iconOnly ? "w-10" : "mx-0.5 gap-1.5 px-3"
      } ${
        disabled
          ? "cursor-not-allowed text-white/25"
          : "text-white/85 hover:bg-white/12 hover:text-white active:scale-95"
      }`}
    >
      {direction === "prev" && <Icon size={iconOnly ? 20 : 18} strokeWidth={2.1} />}
      {!iconOnly && <span className="text-[13px] font-medium">{label}</span>}
      {direction === "next" && <Icon size={iconOnly ? 20 : 18} strokeWidth={2.1} />}
    </button>
  );
}
