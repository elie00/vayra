// Imperative store for the "Watch locally or stream?" prompt, so any point in the
// play chain (detail Play, episode list, autoplay) can raise it. Mirrors the
// leave-confirm store pattern.

export type WatchLocalChoice = "local" | "stream";

type WatchLocalState = {
  open: boolean;
  title: string;
  subtitle: string | null;
  onChoose: ((choice: WatchLocalChoice, remember: boolean) => void) | null;
};

let state: WatchLocalState = { open: false, title: "", subtitle: null, onChoose: null };
const subs = new Set<() => void>();

function emit(): void {
  for (const fn of subs) fn();
}

export function openWatchLocalConfirm(opts: {
  title: string;
  subtitle?: string | null;
  onChoose: (choice: WatchLocalChoice, remember: boolean) => void;
}): void {
  state = {
    open: true,
    title: opts.title,
    subtitle: opts.subtitle ?? null,
    onChoose: opts.onChoose,
  };
  emit();
}

export function closeWatchLocalConfirm(): void {
  if (!state.open) return;
  state = { open: false, title: "", subtitle: null, onChoose: null };
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
