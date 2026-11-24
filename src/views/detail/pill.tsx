export function Pill({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-edge-soft/75 bg-surface/80 px-2.5 text-[12.5px] font-medium text-ink-muted backdrop-blur-md transition-[color,background-color,border-color] duration-150 hover:border-edge hover:bg-elevated hover:text-ink"
      >
        {children}
      </button>
    );
  }
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-edge-soft/75 bg-surface/80 px-2.5 text-[12.5px] font-medium text-ink-muted backdrop-blur-md">
      {children}
    </span>
  );
}
