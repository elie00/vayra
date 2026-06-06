import type { ScoredStream } from "@/lib/streams/types";

export type QualityTier = "4K" | "1080p" | "720p" | "SD";

const TIER_ORDER: QualityTier[] = ["4K", "1080p", "720p", "SD"];

export function qualityTier(s: ScoredStream): QualityTier {
  if (s.resolution === "4K") return "4K";
  if (s.resolution === "1080p") return "1080p";
  if (s.resolution === "720p") return "720p";
  return "SD";
}

export function qualityTiersOf(streams: ScoredStream[]): Array<{ tier: QualityTier; count: number }> {
  const counts = new Map<QualityTier, number>();
  for (const s of streams) {
    const t = qualityTier(s);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return TIER_ORDER.filter((t) => counts.has(t)).map((t) => ({
    tier: t,
    count: counts.get(t) as number,
  }));
}

export function QualityFilterBar({
  options,
  total,
  value,
  onChange,
}: {
  options: Array<{ tier: QualityTier; count: number }>;
  total: number;
  value: string;
  onChange: (v: string) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill active={value === "all"} label="All" count={total} onClick={() => onChange("all")} />
      {options.map((o) => (
        <Pill
          key={o.tier}
          active={value === o.tier}
          label={o.tier}
          count={o.count}
          onClick={() => onChange(o.tier)}
        />
      ))}
    </div>
  );
}

function Pill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
        active
          ? "bg-ink text-canvas"
          : "bg-elevated/50 text-ink-muted ring-1 ring-edge-soft/60 hover:bg-elevated hover:text-ink"
      }`}
    >
      {label}
      <span className={active ? "text-canvas/65" : "text-ink-subtle"}>{count}</span>
    </button>
  );
}
