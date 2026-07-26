import { useEffect } from "react";
import { setUiLanguage } from "@/lib/i18n";
import { localeForRegion, type LocaleProfile } from "@/lib/region/locale-map";
import { useSettings } from "@/lib/settings";
import type { Settings } from "@/lib/settings";

function prepend(value: string, list: string[]): string[] {
  return [value, ...list.filter((x) => x !== value)];
}

export function applyLocaleCascade(
  update: (patch: Partial<Settings>) => void,
  next: LocaleProfile,
  current: Pick<Settings, "preferredLanguages" | "preferredSubLangs" | "preferredAudioLangs">,
): void {
  setUiLanguage(next.uiLanguage === "ar" || next.uiLanguage === "fr" ? next.uiLanguage : "en");
  update({
    uiLanguage: next.uiLanguage === "ar" || next.uiLanguage === "fr" ? next.uiLanguage : "en",
    tmdbLanguage: next.tmdbLanguage,
    preferredLanguages: prepend(next.audioLanguage, current.preferredLanguages),
    preferredSubLangs: prepend(next.subtitleLanguage, current.preferredSubLangs),
    preferredAudioLangs: prepend(next.audioLanguage, current.preferredAudioLangs),
  });
}

export function regionFromNavigator(): string | null {
  if (typeof navigator === "undefined") return null;
  const tag = (navigator.language || "").trim();
  if (!tag) return null;
  const parts = tag.split("-");
  const region = parts[1]?.toUpperCase();
  if (region && region.length === 2) return region;
  const lang = parts[0]?.toLowerCase();
  if (lang === "ar") return "SA";
  if (lang === "es") return "ES";
  if (lang === "fr") return "FR";
  return null;
}

export function useFirstRunLocaleDetect(): void {
  const { settings, update } = useSettings();
  useEffect(() => {
    if (settings.localeDetected) return;
    const detected = regionFromNavigator();
    if (!detected) {
      update({ localeDetected: true });
      return;
    }
    const next = localeForRegion(detected);
    if (next.uiLanguage === "en") {
      update({ localeDetected: true });
      return;
    }
    update({ region: detected, localeDetected: true });
    applyLocaleCascade(update, next, settings);
  }, [settings, update]);
}
