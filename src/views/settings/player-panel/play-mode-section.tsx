import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";

export function PlayModePanel() {
  const { settings, update } = useSettings();
  const t = useT();

  const choices: Array<{
    id: "instant" | "manual";
    label: string;
    sub: string;
    recommended?: boolean;
  }> = [
    {
      id: "instant",
      label: t("Instant"),
      sub: t("Hitting Play jumps straight into playback with the best stream Harbor finds."),
      recommended: true,
    },
    {
      id: "manual",
      label: t("Manual picker"),
      sub: t("Hitting Play opens the source list so you can choose quality, debrid, and audio yourself."),
    },
  ];

  return (
    <div className="flex flex-col gap-2.5">
      {choices.map((c) => {
        const selected = (c.id === "instant") === settings.instantPlay;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => update({ instantPlay: c.id === "instant" })}
            className={`flex items-start gap-3.5 rounded-2xl border px-5 py-4 text-start transition-colors ${
              selected
                ? "border-ink bg-elevated"
                : "border-edge-soft bg-canvas/40 hover:border-edge hover:bg-canvas/60"
            }`}
          >
            <span
              className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                selected ? "border-ink" : "border-edge"
              }`}
            >
              {selected && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-ink">{c.label}</span>
                {c.recommended && (
                  <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-accent">
                    {t("Recommended")}
                  </span>
                )}
              </div>
              <span className="text-[12.5px] leading-snug text-ink-muted">{c.sub}</span>
            </div>
          </button>
        );
      })}
      <button
        type="button"
        id="set-remember-last-stream"
        onClick={() => update({ rememberLastStream: !settings.rememberLastStream })}
        className="mt-1 scroll-mt-28 flex items-start gap-3.5 rounded-2xl border border-edge-soft bg-canvas/40 px-5 py-4 text-start transition-colors hover:border-edge hover:bg-canvas/60"
      >
        <span
          className={`mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${
            settings.rememberLastStream ? "justify-end bg-accent" : "justify-start bg-edge"
          }`}
        >
          <span className="h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)]" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[15px] font-semibold text-ink">{t("Remember last stream")}</span>
          <span className="text-[12.5px] leading-snug text-ink-muted">
            {t("When you resume something you were watching, replay the exact stream you last used (same addon and source) instead of opening the picker again. Turn off to always choose fresh.")}
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={() => update({ resumePrompt: !settings.resumePrompt })}
        className="flex items-start gap-3.5 rounded-2xl border border-edge-soft bg-canvas/40 px-5 py-4 text-start transition-colors hover:border-edge hover:bg-canvas/60"
      >
        <span
          className={`mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${
            settings.resumePrompt ? "justify-end bg-accent" : "justify-start bg-edge"
          }`}
        >
          <span className="h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)]" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[15px] font-semibold text-ink">{t("Ask to resume or start over")}</span>
          <span className="text-[12.5px] leading-snug text-ink-muted">
            {t("When you hit Play on something you've partly watched, show a prompt to resume from where you left off or start over. Also covers items synced from Stremio or Trakt.")}
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={() => update({ resumePlayback: !settings.resumePlayback })}
        className="flex items-start gap-3.5 rounded-2xl border border-edge-soft bg-canvas/40 px-5 py-4 text-start transition-colors hover:border-edge hover:bg-canvas/60"
      >
        <span
          className={`mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${
            settings.resumePlayback ? "justify-end bg-accent" : "justify-start bg-edge"
          }`}
        >
          <span className="h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)]" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[15px] font-semibold text-ink">{t("Resume where you left off")}</span>
          <span className="text-[12.5px] leading-snug text-ink-muted">
            {t("Pick up partly-watched episodes and movies at your saved spot. Anything watched past 80% always restarts. Turn this off to always start from the beginning, handy if you rewatch shows.")}
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={() => update({ keepSourceNextEpisode: !settings.keepSourceNextEpisode })}
        className="mt-1 flex items-start gap-3.5 rounded-2xl border border-edge-soft bg-canvas/40 px-5 py-4 text-start transition-colors hover:border-edge hover:bg-canvas/60"
      >
        <span
          className={`mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${
            settings.keepSourceNextEpisode ? "justify-end bg-accent" : "justify-start bg-edge"
          }`}
        >
          <span className="h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)]" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[15px] font-semibold text-ink">{t("Keep same source on next episode")}</span>
          <span className="text-[12.5px] leading-snug text-ink-muted">
            {t("When auto-playing the next episode, keep the same release/source you were just watching instead of Harbor's top-ranked stream. Falls back to the best stream if that source isn't available.")}
          </span>
        </div>
      </button>
    </div>
  );
}