import { getUiLanguage } from "@/lib/i18n";

// The interface language sets the clock: 5:30 PM in English, 17:30 in French.
export function fmtClock(ms: number, lang: string = getUiLanguage()): string {
  return new Date(ms).toLocaleTimeString(lang === "ar" ? "ar-SA" : lang, { hour: "numeric", minute: "2-digit" });
}

export function fmtLeft(
  endMs: number,
  nowMs: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string | null {
  const ms = endMs - nowMs;
  if (ms <= 0) return null;
  const totalMin = Math.ceil(ms / 60_000);
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    return mm ? t("{h}h {m}m left", { h, m: mm }) : t("{h}h left", { h });
  }
  return t("{m}m left", { m: Math.max(1, totalMin) });
}

export function channelNumber(attrs: Record<string, string>): string | null {
  return attrs["tvg-chno"] || attrs["channel-number"] || attrs["chno"] || null;
}
