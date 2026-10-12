import { t } from "@/lib/i18n";
import type { ScoreReason } from "./types";

export type ScoreLine = { label: string; delta: number };

/** What raised or lowered a source's score, in words, the strongest first. */
export function explainScore(reasons: ScoreReason[]): ScoreLine[] {
  const lines = new Map<string, number>();
  for (const r of reasons) {
    if (r.delta === 0 || r.signal.startsWith("filtered:")) continue;
    const label = labelFor(r.signal);
    lines.set(label, (lines.get(label) ?? 0) + r.delta);
  }
  return [...lines]
    .map(([label, delta]) => ({ label, delta }))
    .filter((l) => l.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function labelFor(signal: string): string {
  switch (signal) {
    case "cached":
      return t("Cached on your debrid service");
    case "easynews-direct":
      return t("Easynews direct link");
    case "direct url":
    case "prelinked-url":
      return t("Direct link, no torrent to start");
    case "4K":
    case "1080p":
    case "720p":
    case "480p":
      return t("{resolution} resolution", { resolution: signal });
    case "DV":
    case "DV+HDR10":
    case "HDR10":
    case "HDR10+":
    case "HLG":
      return t("HDR ({format})", { format: signal });
    case "HEVC":
    case "AV1":
      return t("Efficient video codec ({codec})", { codec: signal });
    case "Atmos":
    case "TrueHD":
    case "DTS-HD MA":
    case "DD+":
      return t("High quality audio ({codec})", { codec: signal });
    case "zero-seeders-stale-meta":
    case "zero-seeders-soft":
      return t("No seeders");
    case "REMUX":
      return t("Untouched Blu-ray copy (REMUX)");
    case "PROPER":
      return t("Corrected release (PROPER)");
    case "CAM penalty":
      return t("Filmed in a theater (CAM)");
    case "Telesync penalty":
      return t("Recorded in a theater (Telesync)");
    case "Telecine penalty":
      return t("Copied from film reel (Telecine)");
    case "Screener penalty":
      return t("Preview copy (Screener)");
    case "language-unknown":
      return t("Audio language not stated");
    case "preferred-language":
      return t("In your preferred language");
    case "multi-language":
      return t("Several audio languages");
    case "language-mismatch":
      return t("Not in your preferred language");
    case "html5-multi-audio-penalty":
      return t("Several audio tracks, poorly handled by this player");
    case "scam-penalty":
      return t("Looks like a fake or a scam");
    case "origin-addon":
      return t("From the add-on this title came from");
    case "strong-addon":
    case "trusted-addon":
      return t("Reliable add-on");
    case "webview2-unfriendly":
      return t("Harder for the player to decode");
    case "low-bandwidth-4k":
    case "low-bandwidth-1080p":
      return t("Too heavy for your connection");
    case "size-mismatch":
      return t("Size doesn't match the stated quality");
    case "title-says-hires-filename-says-cam":
      return t("File name says it was filmed in a theater");
    case "fresh-theater-cinema-window":
    case "fresh-theater-mild-boost":
      return t("Still in theaters: a theater copy is expected");
    case "fresh-fake-remux":
    case "fresh-fake-prerelease":
    case "fresh-fake-prebluray":
    case "fresh-fake-soft":
    case "fresh-prebluray-suspect":
    case "fresh-prerelease-soft":
    case "fresh-soft-flag":
      return t("Quality too good this soon after release");
  }
  const seeders = /^seeders=(\d+)$/.exec(signal);
  if (seeders) return t("{count} seeders", { count: seeders[1] });
  const year = /^year-(?:off-by-1|mismatch):(\d+)vs(\d+)/.exec(signal);
  if (year) return t("Year {year} instead of {expected}", { year: year[1], expected: year[2] });
  const group = /^group:(.+)$/.exec(signal);
  if (group) return t("Trusted release group ({group})", { group: group[1] });
  if (signal.startsWith("prev-episode-group:")) return t("Same release group as the previous episode");
  if (/^\d+\.0 channels$/.test(signal)) return t("Surround sound");
  if (/^REPACK\d*$/.test(signal)) return t("Corrected release (REPACK)");
  if (signal.startsWith("addon-priority-")) return t("High in your add-on order");
  if (signal.startsWith("bitrate-exceeds-budget")) return t("Too heavy for your connection");
  if (signal.startsWith("bitrate-tight")) return t("Close to your connection's limit");
  if (/-undersized-/.test(signal)) return t("Too small for its resolution");
  if (signal.startsWith("new-release-")) return t("Too small for a new release");
  return signal;
}
