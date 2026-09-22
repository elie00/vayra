import { normalizeLang } from "../subtitles/language";

const formatters = new Map<string, Intl.DisplayNames>();

/** Presentation only: provider IDs and saved language preferences stay unchanged. */
export function localizedLanguageName(name: string, locale: string): string {
  const code = normalizeLang(name);
  if (!/^[a-z]{2,3}(-([a-z]{2}|\d{3}))?$/.test(code)) return name;
  try {
    let formatter = formatters.get(locale);
    if (!formatter) {
      formatter = new Intl.DisplayNames([locale], { type: "language", fallback: "none" });
      formatters.set(locale, formatter);
    }
    const label = formatter.of(code);
    return label ? label[0].toLocaleUpperCase(locale) + label.slice(1) : name;
  } catch {
    return name;
  }
}
