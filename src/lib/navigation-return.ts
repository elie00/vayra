import type { Frame } from "./view";

/** Return to the exact origin without rebuilding its detail frame or scroll key. */
export function playbackReturnStack(stack: Frame[]): Frame[] {
  let index = stack.length - 1;
  while (index > 0 && (stack[index].kind === "player" || stack[index].kind === "picker")) index--;
  return stack.slice(0, index + 1);
}
