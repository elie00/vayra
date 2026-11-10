/** A country's name in the interface language; `fallback` when the runtime cannot name it. */
export function regionName(code: string, fallback: string, lang: string): string {
  try {
    return new Intl.DisplayNames([lang], { type: "region" }).of(code) ?? fallback;
  } catch {
    return fallback;
  }
}
