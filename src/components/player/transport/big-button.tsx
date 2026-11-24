import { Tooltip } from "./tooltip";

export function BigButton({
  children,
  onClick,
  ariaLabel,
  tooltip,
  active,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  ariaLabel: string;
  tooltip?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,color,opacity,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-reduce:transition-none ${
        disabled
          ? "cursor-not-allowed text-white/30"
          : active
            ? "bg-white/20 text-white ring-1 ring-white/15 hover:bg-white/26 active:scale-95"
            : "text-white/80 hover:bg-white/12 hover:text-white active:scale-95"
      }`}
    >
      {children}
    </button>
  );
  if (!tooltip) return btn;
  return <Tooltip label={tooltip}>{btn}</Tooltip>;
}
