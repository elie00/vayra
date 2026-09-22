export type EscapeAction = "exit-fullscreen" | "confirm-leave" | "close";

/** Escape in fullscreen leaves fullscreen first; only the next press closes the video. */
export function playerEscapeAction(opts: {
  fullscreen: boolean;
  escExitsFullscreen: boolean;
  confirmLeave: boolean;
}): EscapeAction {
  if (opts.escExitsFullscreen && opts.fullscreen) return "exit-fullscreen";
  return opts.confirmLeave ? "confirm-leave" : "close";
}
