import { ArrowRight, Check, Circle, LockKeyhole, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { usePrivateBetaLaunch } from "@/lib/private-beta-launch-provider";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useView } from "@/lib/view";

type StepId = "welcome" | "profile" | "relationship" | "group" | "room" | "ready";

const STEPS: StepId[] = ["welcome", "profile", "relationship", "group", "room", "ready"];

export function PrivateBetaLaunchModal() {
  const t = useT();
  const { openSettings } = useView();
  const {
    eligible,
    open,
    progress,
    completedCount,
    closeGuide,
    dismissGuide,
    markRoomBriefingSeen,
  } = usePrivateBetaLaunch();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<StepId>("welcome");
  useFocusTrap(dialogRef, eligible && open);

  const firstIncomplete = useMemo<StepId>(() => {
    if (!progress.profile) return "profile";
    if (!progress.relationship) return "relationship";
    if (!progress.group) return "group";
    if (!progress.roomBriefing || !progress.roomOpened) return "room";
    return "ready";
  }, [progress]);

  useEffect(() => {
    if (!open) return;
    setStep(completedCount === 0 ? "welcome" : firstIncomplete);
  }, [completedCount, firstIncomplete, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissGuide();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismissGuide, open]);

  if (!eligible || !open) return null;

  const openCira = () => {
    closeGuide();
    openSettings("cira");
  };

  const index = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(index + 1, STEPS.length - 1)]);
  const back = () => setStep(STEPS[Math.max(index - 1, 0)]);

  const copy = {
    welcome: {
      eyebrow: t("Private beta guide"),
      title: t("Your first private watch room"),
      body: t("Set up a private identity, connect with someone you know, then open a synchronized room together. Nothing is public."),
    },
    profile: {
      eyebrow: t("Step 1 · Your identity"),
      title: t("Choose how your circle recognizes you"),
      body: t("Create a minimal CIRA profile and a unique handle. Only accepted relations and private groups can see it."),
    },
    relationship: {
      eyebrow: t("Step 2 · One trusted person"),
      title: t("Connect intentionally"),
      body: t("Add one person by their exact handle or a short-lived QR invitation. There is no public directory or contact import."),
    },
    group: {
      eyebrow: t("Step 3 · A private group"),
      title: t("Create or join a group"),
      body: t("Groups have explicit members and roles. You can also continue with a direct relationship after completing this guide."),
    },
    room: {
      eyebrow: t("Step 4 · Watch together"),
      title: t("Each participant opens their own content"),
      body: t("VARA never shares a stream or source. Everyone opens the content locally; VEYA synchronizes only play, pause and seeking."),
    },
    ready: {
      eyebrow: t("Setup complete"),
      title: t("Your private beta space is ready"),
      body: t("You can reopen this guide, get recovery help or send privacy-safe feedback from Settings at any time."),
    },
  }[step];

  return (
    <div className="fixed inset-0 z-[75] grid place-items-center bg-canvas/85 p-4 backdrop-blur-md">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="private-beta-launch-title"
        className="relative flex max-h-[min(760px,92vh)] w-[min(620px,94vw)] flex-col overflow-hidden rounded-[28px] border border-edge-soft bg-elevated shadow-[0_40px_100px_-24px_rgba(0,0,0,0.75)]"
      >
        <button
          type="button"
          onClick={dismissGuide}
          aria-label={t("Dismiss private beta guide")}
          className="absolute end-5 top-5 z-10 grid h-9 w-9 place-items-center rounded-full text-ink-subtle transition hover:bg-canvas hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="overflow-y-auto px-6 pb-6 pt-8 sm:px-10 sm:pb-8 sm:pt-10">
          <div className="mb-8 flex items-center justify-between gap-4 pe-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-edge-soft bg-canvas/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden />
              {t("Invite-only · privacy-first")}
            </div>
            <span className="text-[12px] tabular-nums text-ink-subtle">
              {t("{count} of 5 complete", { count: completedCount })}
            </span>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">{copy.eyebrow}</p>
          <h2 id="private-beta-launch-title" className="mt-3 max-w-[520px] font-display text-[30px] font-medium leading-[1.08] tracking-tight text-ink sm:text-[38px]">
            {copy.title}
          </h2>
          <p className="mt-4 max-w-[540px] text-[14px] leading-6 text-ink-muted sm:text-[15px]">{copy.body}</p>

          {step === "welcome" ? (
            <div className="mt-8 grid gap-2 sm:grid-cols-3">
              {[
                [t("Private by design"), t("No public profile or directory")],
                [t("You choose the people"), t("Exact handle or private invite")],
                [t("Sources stay local"), t("Only playback intent is synchronized")],
              ].map(([title, body]) => (
                <div key={title} className="rounded-2xl border border-edge-soft bg-canvas/35 p-4">
                  <p className="text-[13px] font-medium text-ink">{title}</p>
                  <p className="mt-1 text-[11.5px] leading-5 text-ink-subtle">{body}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-8 grid gap-2" aria-label={t("Private beta setup progress")}>
              {[
                [t("CIRA profile"), progress.profile],
                [t("Accepted relation"), progress.relationship],
                [t("Active private group"), progress.group],
                [t("Privacy briefing"), progress.roomBriefing],
                [t("First VARA opened"), progress.roomOpened],
              ].map(([label, done]) => (
                <div key={String(label)} className="flex items-center gap-3 rounded-xl border border-edge-soft bg-canvas/30 px-4 py-3">
                  {done ? <Check className="h-4 w-4 text-accent" aria-hidden /> : <Circle className="h-4 w-4 text-ink-subtle" aria-hidden />}
                  <span className={`text-[13px] ${done ? "text-ink" : "text-ink-muted"}`}>{label}</span>
                  <span className="sr-only">{done ? t("Complete") : t("Not complete")}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge-soft bg-canvas/35 px-5 py-4 sm:px-8">
          <button type="button" onClick={dismissGuide} className="h-10 rounded-full px-3 text-[13px] font-medium text-ink-subtle hover:text-ink">
            {t("Not now")}
          </button>
          <div className="flex items-center gap-2">
            {index > 0 ? (
              <button type="button" onClick={back} className="h-10 rounded-full px-4 text-[13px] font-medium text-ink-muted hover:text-ink">
                {t("Back")}
              </button>
            ) : null}
            {step === "welcome" ? (
              <button type="button" onClick={next} className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[13px] font-semibold text-canvas">
                {t("Start private setup")} <ArrowRight className="h-4 w-4 dir-icon" aria-hidden />
              </button>
            ) : step === "room" ? (
              <button type="button" onClick={() => { markRoomBriefingSeen(); openCira(); }} className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[13px] font-semibold text-canvas">
                {t("I understand · Open VARA")} <ArrowRight className="h-4 w-4 dir-icon" aria-hidden />
              </button>
            ) : step === "ready" ? (
              <button type="button" onClick={closeGuide} className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[13px] font-semibold text-canvas">
                {t("Enter VAYRA")} <Users className="h-4 w-4" aria-hidden />
              </button>
            ) : (
              <button type="button" onClick={openCira} className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[13px] font-semibold text-canvas">
                {t("Open CIRA settings")} <ArrowRight className="h-4 w-4 dir-icon" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
