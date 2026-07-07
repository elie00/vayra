// Imperative store for the "Watch locally or stream?" prompt, so any point in the
// play chain (detail Play, episode list, autoplay) can raise it. Mirrors the
// leave-confirm store pattern.

// "local" = play the local copy (resume if there's saved progress); "local-restart"
// = play the local copy from 0:00; "stream" = go to the source picker.
export type WatchLocalChoice = "local" | "local-restart" | "stream";

type WatchLocalState = {
  open: boolean;
  title: string;
  subtitle: string | null;
  // When there's a saved resume position, the modal offers a "continue" vs
  // "from the beginning" split; resumeMs drives the timestamp on the button.
  hasResume: boolean;
  resumeMs: number;
  onChoose: ((choice: WatchLocalChoice, remember: boolean) => void) | null;
};

let state: WatchLocalState = {
  open: false,
  title: "",
  subtitle: null,
  hasResume: false,
  resumeMs: 0,
  onChoose: null,
};
const subs = new Set<() => void>();

function emit(): void {
  for (const fn of subs) fn();
}

export function openWatchLocalConfirm(opts: {
  title: string;
  subtitle?: string | null;
  hasResume?: boolean;
  resumeMs?: number;
  onChoose: (choice: WatchLocalChoice, remember: boolean) => void;
}): void {
  state = {
    open: true,
    title: opts.title,
    subtitle: opts.subtitle ?? null,
    hasResume: opts.hasResume === true,
    resumeMs: opts.resumeMs ?? 0,
    onChoose: opts.onChoose,
  };
  emit();
}

export function closeWatchLocalConfirm(): void {
  if (!state.open) return;
  state = { open: false, title: "", subtitle: null, hasResume: false, resumeMs: 0, onChoose: null };
  emit();
}

export function getWatchLocalConfirm(): WatchLocalState {
  return state;
}

export function subscribeWatchLocalConfirm(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
