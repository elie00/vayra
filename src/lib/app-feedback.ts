export type AppFeedbackKind = "success" | "error" | "info";

export type AppFeedback = {
  id: number;
  kind: AppFeedbackKind;
  text: string;
  durationMs?: number;
};

type AppFeedbackInput = Omit<AppFeedback, "id">;
type Listener = (feedback: AppFeedback) => void;

const listeners = new Set<Listener>();
let sequence = 0;

export function emitAppFeedback(input: AppFeedbackInput): void {
  const feedback = { ...input, id: ++sequence };
  for (const listener of listeners) listener(feedback);
}

export function subscribeAppFeedback(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
