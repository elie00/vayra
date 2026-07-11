export type UiLanguage = "en" | "ar" | "pt" | "fr" | "es" | "de";

export type LanguageOption = {
  code: UiLanguage;
  label: string;
  nativeLabel: string;
  rtl: boolean;
};

export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English", nativeLabel: "English", rtl: false },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", rtl: true },
  { code: "pt", label: "Portuguese", nativeLabel: "Português", rtl: false },
  { code: "fr", label: "French", nativeLabel: "Français", rtl: false },
  { code: "es", label: "Spanish", nativeLabel: "Español", rtl: false },
  { code: "de", label: "German", nativeLabel: "Deutsch", rtl: false },
];

export function isRtl(lang: UiLanguage): boolean {
  return lang === "ar";
}
