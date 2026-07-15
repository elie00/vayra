import { Check, Circle, RotateCcw, ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n";
import { usePrivateBetaLaunch } from "@/lib/private-beta-launch-provider";
import { Section } from "./shared";

export function PrivateBetaGuideCard() {
  const t = useT();
  const { completedCount, progress, openGuide, resetGuide } = usePrivateBetaLaunch();
  const items = [
    [t("Create your private profile"), progress.profile],
    [t("Connect with one trusted person"), progress.relationship],
    [t("Create or join a private group"), progress.group],
    [t("Understand how Watch Rooms protect sources"), progress.roomBriefing],
    [t("Open your first VARA"), progress.roomOpened],
  ] as const;

  return (
    <Section
      title={t("Private beta launch guide")}
      subtitle={t("A guided path to your first private, synchronized Watch Room.")}
    >
      <div className="flex flex-col gap-4 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-elevated text-ink">
              <ShieldCheck className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div>
              <p className="text-[14px] font-medium text-ink">{t("{count} of 5 complete", { count: completedCount })}</p>
              <p className="text-[11.5px] text-ink-subtle">{t("Stored only on this device as completion flags.")}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={openGuide} className="h-9 rounded-lg bg-ink px-3 text-[12.5px] font-medium text-canvas">
              {completedCount === 5 ? t("Review guide") : t("Continue guide")}
            </button>
            {completedCount > 0 ? (
              <button type="button" onClick={resetGuide} aria-label={t("Restart guide")} className="grid h-9 w-9 place-items-center rounded-lg border border-edge-soft text-ink-subtle hover:text-ink">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map(([label, done]) => (
            <div key={label} className="flex items-center gap-2.5 rounded-xl border border-edge-soft px-3 py-2.5">
              {done ? <Check className="h-3.5 w-3.5 text-accent" aria-hidden /> : <Circle className="h-3.5 w-3.5 text-ink-subtle" aria-hidden />}
              <span className="text-[12px] text-ink-muted">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
