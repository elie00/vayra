import type { SubCue } from "./parser";

export type SyncAnchor = {
  t: number;
  heardAt: number;
  delta: number;
  cueIndex: number;
};

export const MIN_GAP_SEC = 3.0;
export const MAX_SLOPE = 0.05;

export function computeSyncMap(anchors: SyncAnchor[]): (t: number) => number {
  if (anchors.length === 0) {
    return () => 0;
  }
  if (anchors.length === 1) {
    const d = anchors[0].delta;
    return () => d;
  }
  const sorted = [...anchors].sort((a, b) => a.t - b.t);
  const a1 = sorted[0];
  const a2 = sorted[sorted.length - 1];
  const dt = a2.t - a1.t;
  if (Math.abs(dt) < 1e-9) {
    throw new Error(
      "computeSyncMap: anchor points share the same original time (t1 === t2); cannot compute linear slope",
    );
  }
  const m = (a2.delta - a1.delta) / dt;
  const d1 = a1.delta;
  const t1 = a1.t;
  return (t: number) => d1 + m * (t - t1);
}

export function applySync(
  cues: SubCue[],
  f: (t: number) => number,
  extraOffsetSec: number,
): SubCue[] {
  return cues.map((cue) => {
    const start = round3(Math.max(0, cue.start + f(cue.start) + extraOffsetSec));
    const endCandidate = round3(cue.end + f(cue.end) + extraOffsetSec);
    const end = Math.max(start + 0.001, endCandidate);
    return { start, end, text: cue.text };
  });
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function evaluateAnchors(anchors: SyncAnchor[]): {
  gapWarning: string | null;
  slopeWarning: string | null;
} {
  if (anchors.length < 2) {
    return { gapWarning: null, slopeWarning: null };
  }
  const sorted = [...anchors].sort((a, b) => a.t - b.t);
  const a1 = sorted[0];
  const a2 = sorted[sorted.length - 1];
  const gap = Math.abs(a2.t - a1.t);
  let gapWarning: string | null = null;
  if (gap < MIN_GAP_SEC) {
    gapWarning = `النقطتان قريبتان جداً (${gap.toFixed(1)}ث). حدّد نقطتين متباعدتين (واحدة قرب البداية وأخرى قرب النهاية) وإلا قد يُضخّم الانحراف عند الأطراف.`;
  }
  let slopeWarning: string | null = null;
  if (gap > 1e-9) {
    const m = Math.abs((a2.delta - a1.delta) / (a2.t - a1.t));
    if (m > MAX_SLOPE) {
      slopeWarning = `ميل التصحيح كبير غير معقول (${(m * 100).toFixed(1)}%). ربما إحدى النقطتين خاطئة — راجعهما.`;
    }
  }
  return { gapWarning, slopeWarning };
}
