import { useEffect, useState } from "react";
import { scheduleWindow, type Programme } from "@/lib/addon-epg";
import { useT } from "@/lib/i18n";

const UPCOMING = 6;

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * The programme guide of a live channel. Its videos are programmes, not episodes:
 * playback always goes through the channel, so nothing here is clickable to play.
 */
export function ProgrammeSchedule({ programmes }: { programmes: Programme[] }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const { current, upcoming } = scheduleWindow(programmes, now, UPCOMING);

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-[22px] font-medium tracking-tight text-ink">{t("Programme guide")}</h3>
      {!current && upcoming.length === 0 && (
        <p className="text-[13px] text-ink-subtle">{t("No programme information right now")}</p>
      )}
      {current && (
        <div className="flex flex-col gap-2 rounded-2xl bg-elevated/40 px-5 py-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">{t("On now")}</span>
          <h4 className="text-[18px] font-semibold text-ink" dir="auto">{current.title}</h4>
          <p className="text-[12px] text-ink-subtle">
            {clock(current.startMs)} – {clock(current.endMs)}
          </p>
          <div className="h-1 overflow-hidden rounded-full bg-edge-soft" aria-hidden>
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.min(100, ((now - current.startMs) / (current.endMs - current.startMs)) * 100)}%` }}
            />
          </div>
          {current.overview && (
            <p className="text-[13.5px] leading-relaxed text-ink-muted" dir="auto">{current.overview}</p>
          )}
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-subtle">{t("Up next")}</span>
          {upcoming.map((p) => (
            <div key={p.id} className="flex items-baseline gap-4 rounded-xl px-2 py-2">
              <span className="w-14 shrink-0 text-[13px] tabular-nums text-ink-subtle">{clock(p.startMs)}</span>
              <span className="truncate text-[14px] text-ink" dir="auto">{p.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
