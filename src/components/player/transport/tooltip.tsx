export function Tooltip({
  label,
  shortcut,
  children,
  side = "top",
  align = "center",
}: {
  label: string;
  shortcut?: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
  align?: "center" | "end";
}) {
  return (
    <div className="group/tip relative inline-flex">
      {children}
      <div
        role="tooltip"
        className={`pointer-events-none absolute z-30 flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/12 bg-[#0d0e11]/94 px-2.5 py-1 text-[11.5px] font-medium text-white/95 opacity-0 shadow-[0_14px_34px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 motion-reduce:transition-none ${
          side === "top" ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"
        } ${align === "end" ? "end-0" : "left-1/2 -translate-x-1/2"}`}
      >
        <span>{label}</span>
        {shortcut && (
          <kbd className="rounded-md border border-white/12 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/85">
            {shortcut}
          </kbd>
        )}
      </div>
    </div>
  );
}
