/** A bounded watchdog for an explicit resume, not for initial buffering. */
export const RESUME_CHECK_MS = 8_000;
export const RESUME_RECOVERY_MS = 25_000;

export function createResumeRecovery(options: {
  reload: (position: number, isCurrent: () => boolean) => Promise<void>;
  onState: (state: "reloading" | "recovered" | "failed") => void;
}) {
  let generation = 0;
  let active = false;
  let reloading = false;
  let position = 0;
  let observed: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    generation++;
    active = false;
    reloading = false;
    clearTimeout(timer);
  };

  const recover = () => {
    if (!active || reloading) return;
    reloading = true;
    observed = null;
    clearTimeout(timer);
    const ownGeneration = generation;
    const isCurrent = () => active && ownGeneration === generation;
    const fail = () => {
      if (!isCurrent()) return;
      cancel();
      options.onState("failed");
    };
    options.onState("reloading");
    // Includes a stuck IPC command or an upstream that never finishes loading.
    timer = setTimeout(fail, RESUME_RECOVERY_MS);
    void options.reload(position, isCurrent).catch(fail);
  };

  return {
    start(at: number) {
      if (active) return; // Repeated Play must not postpone the deadline.
      generation++;
      active = true;
      position = Number.isFinite(at) ? Math.max(0, at) : 0;
      observed = position;
      timer = setTimeout(recover, RESUME_CHECK_MS);
    },
    observe(at: number) {
      // A file-loaded event or pause=false is not evidence of playback.
      if (!active || !Number.isFinite(at) || at < position) return;
      // After loadfile the first sample may merely be a seek landing. Require
      // a subsequent advancing sample before declaring recovery successful.
      if (observed === null) { observed = at; return; }
      if (at <= observed + 0.3) return;
      cancel();
      options.onState("recovered");
    },
    recover,
    cancel,
    isActive: () => active,
  };
}
