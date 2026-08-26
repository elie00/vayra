import { useSyncExternalStore } from "react";
import en from "./locales/en";
import { getUiLanguage, useUiLanguage } from "./store";
import { isRtl, LANGUAGES, type UiLanguage } from "./languages";

type Vars = Record<string, string | number>;
type Catalog = Record<string, string>;
type TranslatedLanguage = Exclude<UiLanguage, "en">;

const catalogLoaders = {
  ar: () => import("./locales/ar").then((module) => module.default),
  pt: () => import("./locales/pt").then((module) => module.default),
  fr: () => import("./locales/fr").then((module) => module.default),
  es: () => import("./locales/es").then((module) => module.default),
  de: () => import("./locales/de").then((module) => module.default),
  it: () => import("./locales/it").then((module) => module.default),
} satisfies Record<TranslatedLanguage, () => Promise<Catalog>>;

const catalogs: Partial<Record<UiLanguage, Catalog>> = { en };
const catalogLoads = new Map<TranslatedLanguage, Promise<void>>();
const failedCatalogs = new Set<TranslatedLanguage>();
const catalogListeners = new Set<() => void>();
let catalogVersion = 0;

function subscribeCatalogs(listener: () => void): () => void {
  catalogListeners.add(listener);
  return () => catalogListeners.delete(listener);
}

function getCatalogVersion(): number {
  return catalogVersion;
}

export function isUiLanguageLoaded(lang: UiLanguage): boolean {
  return catalogs[lang] !== undefined;
}

export function loadUiLanguage(lang: UiLanguage): Promise<void> {
  if (lang === "en" || catalogs[lang]) return Promise.resolve();
  const existing = catalogLoads.get(lang);
  if (existing) return existing;

  const promise = catalogLoaders[lang]()
    .then((catalog) => {
      catalogs[lang] = catalog;
      failedCatalogs.delete(lang);
      catalogVersion += 1;
      for (const listener of catalogListeners) listener();
    })
    .catch((error: unknown) => {
      failedCatalogs.add(lang);
      console.warn(`[i18n] failed to load ${lang} catalog`, error);
    })
    .finally(() => catalogLoads.delete(lang));
  catalogLoads.set(lang, promise);
  return promise;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  let out = template;
  for (const [name, value] of Object.entries(vars)) {
    out = out.split(`{${name}}`).join(String(value));
  }
  return out;
}

function resolve(lang: UiLanguage, key: string): string {
  const catalog = catalogs[lang];
  if (!catalog && lang !== "en" && !failedCatalogs.has(lang)) void loadUiLanguage(lang);
  const active = catalog?.[key];
  if (active !== undefined) return active;
  const fallback = en[key];
  if (fallback !== undefined) return fallback;
  return key;
}

export function t(key: string, vars?: Vars): string {
  return interpolate(resolve(getUiLanguage(), key), vars);
}

export function useT(): (key: string, vars?: Vars) => string {
  const lang = useUiLanguage();
  useSyncExternalStore(subscribeCatalogs, getCatalogVersion, getCatalogVersion);
  return (key: string, vars?: Vars) => interpolate(resolve(lang, key), vars);
}

export { useUiLanguage, isRtl, LANGUAGES };
