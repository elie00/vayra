import { useSettings } from "@/lib/settings";
import { useT, useUiLanguage } from "@/lib/i18n";
import { localizedLanguageName } from "@/lib/i18n/language-label";

export function LanguagePreferencesSummary() {
  const { settings } = useSettings();
  const t = useT();
  const ui = useUiLanguage();
  const display = (name: string) => localizedLanguageName(name, ui);
  const rows = [
    [t("Interface"), display(ui)],
    [t("Descriptions"), settings.translateDescriptions ? display((settings.tmdbLanguage || "en").split("-")[0]) : display("en")],
    [t("Audio"), settings.preferredAudioLangs.map(display).join(" → ") || t("Automatic")],
    [t("Subtitles"), settings.subtitlesOffByDefault ? t("Off at playback start") : settings.preferredSubLangs.map(display).join(" → ") || t("Automatic")],
  ];
  return <section aria-label={t("Your language preferences")} className="rounded-2xl bg-elevated p-5"><h2 className="mb-4 text-[17px] font-semibold text-ink">{t("Your language preferences")}</h2><dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-[13px]">{rows.map(([label, value]) => <div key={label} className="contents"><dt className="text-ink-muted">{label}</dt><dd className="font-medium text-ink">{value}</dd></div>)}</dl><p className="mt-4 max-w-[65ch] text-[12px] leading-relaxed text-ink-muted">{t("These preferences are independent. Changing the interface does not change the audio or subtitles.")}</p></section>;
}
