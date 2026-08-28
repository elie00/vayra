import { isWeb } from "@/lib/platform";

type PlaybackSettings = {
  instantPlay: boolean;
  seasonSourceLock: boolean;
};

export function applyLiteRuntimeSettings<T extends PlaybackSettings>(
  settings: T,
  lite = isWeb(),
): T {
  if (!lite || (settings.instantPlay && !settings.seasonSourceLock)) return settings;
  return { ...settings, instantPlay: true, seasonSourceLock: false };
}

export function shouldRevealLiteSourceFallback(
  lite: boolean,
  availableSourceCount: number,
  automaticCandidateCount: number,
): boolean {
  return lite && availableSourceCount > 0 && automaticCandidateCount === 0;
}
