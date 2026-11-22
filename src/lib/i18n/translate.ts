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
  fr: () => import("./locales/fr-core").then((module) => module.default),
  es: () => import("./locales/es").then((module) => module.default),
  de: () => import("./locales/de").then((module) => module.default),
  it: () => import("./locales/it").then((module) => module.default),
} satisfies Record<TranslatedLanguage, () => Promise<Catalog>>;

const extendedLoaders: Partial<Record<TranslatedLanguage, () => Promise<Catalog>>> = {
  fr: () => import("./locales/fr-extended").then((module) => module.default),
};

const catalogs: Partial<Record<UiLanguage, Catalog>> = { en };
const catalogLoads = new Map<TranslatedLanguage, Promise<void>>();
const extendedLoads = new Map<TranslatedLanguage, Promise<void>>();
const extendedLoaded = new Set<TranslatedLanguage>();
const failedCatalogs = new Set<TranslatedLanguage>();
const catalogListeners = new Set<() => void>();
let catalogVersion = 0;

function notifyCatalogListeners(): void {
  catalogVersion += 1;
  for (const listener of catalogListeners) listener();
}

function hydrateExtendedCatalog(lang: TranslatedLanguage): void {
  const loader = extendedLoaders[lang];
  if (!loader || extendedLoaded.has(lang) || extendedLoads.has(lang)) return;
  const promise = loader()
    .then((extended) => {
      extendedLoaded.add(lang);
      const current = catalogs[lang];
      catalogs[lang] = current ? { ...extended, ...current } : extended;
      notifyCatalogListeners();
    })
    .catch((error: unknown) => {
      console.warn(`[i18n] failed to load extended ${lang} catalog`, error);
    })
    .finally(() => extendedLoads.delete(lang));
  extendedLoads.set(lang, promise);
}

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
  if (lang === "en") return Promise.resolve();
  if (catalogs[lang]) {
    hydrateExtendedCatalog(lang);
    return Promise.resolve();
  }
  const existing = catalogLoads.get(lang);
  if (existing) return existing;

  const promise = catalogLoaders[lang]()
    .then((catalog) => {
      const existingCatalog = catalogs[lang];
      catalogs[lang] = existingCatalog ? { ...existingCatalog, ...catalog } : catalog;
      failedCatalogs.delete(lang);
      notifyCatalogListeners();
      // Hydrate secondary dictionary right after first paint without blocking boot.
      if (extendedLoaders[lang] && !extendedLoaded.has(lang)) {
        if (typeof window !== "undefined" && "requestIdleCallback" in window) {
          (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
            .requestIdleCallback(() => hydrateExtendedCatalog(lang), { timeout: 600 });
        } else {
          queueMicrotask(() => hydrateExtendedCatalog(lang));
        }
      }
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
  if (lang !== "en" && catalog && extendedLoaders[lang] && !extendedLoaded.has(lang)) {
    hydrateExtendedCatalog(lang);
  }
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
