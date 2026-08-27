import type { PlayerSnapshot, PlayerStatus } from "../bridge";

const HAVE_FUTURE_DATA = 3;

export type Html5PlaybackFacts = {
  paused: boolean;
  ended: boolean;
  hasError: boolean;
  readyState: number;
  currentTime: number;
  rendered: PlayerSnapshot["rendered"];
};

export type Html5PlaybackState = {
  status: PlayerStatus;
  buffering: boolean;
  rendered: boolean;
};

/** Pure playback-state decision shared by every HTML5 media event. */
export function deriveHtml5PlaybackState(facts: Html5PlaybackFacts): Html5PlaybackState {
  let status: PlayerStatus;
  if (facts.hasError) status = "error";
  else if (facts.ended) status = "ended";
  else if (!facts.paused) status = "playing";
  else if (facts.readyState >= HAVE_FUTURE_DATA) status = "paused";
  else status = "loading";

  return {
    status,
    buffering:
      !facts.paused &&
      !facts.ended &&
      !facts.hasError &&
      facts.readyState < HAVE_FUTURE_DATA,
    rendered:
      facts.rendered === true ||
      (!facts.paused && !facts.hasError && facts.currentTime > 0),
  };
}
