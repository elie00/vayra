import { emitAppFeedback } from "@/lib/app-feedback";

export function emitListToast(text: string): void {
  emitAppFeedback({ kind: "success", text, durationMs: 2400 });
}
