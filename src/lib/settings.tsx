import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { applyTheme } from "@/lib/theme";
import { loadBgImage, saveBgImage } from "@/lib/theme-storage";
import { effectiveTmdbLanguage, setTmdbLanguage } from "@/lib/providers/tmdb/tmdb-client";
import { setPosterBaseUrl } from "@/lib/providers/rpdb";
import { setMdblistBatchKey } from "@/lib/providers/mdblist-batch";
import { setUiLanguage } from "@/lib/i18n";
import { STORAGE_KEY } from "./settings/defaults";
import { loadStoredSettings } from "./settings/load";
import { readSettingsFile, writeSettingsFile } from "./settings/file-store";
import type { Settings, StreamingService } from "./settings/types";

export type {
  ContentCategory,
  ContentFilters,
  Settings,
  StreamingService,
  WebhookTrigger,
} from "./settings/types";

type SettingsValue = {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  toggleStreaming: (s: StreamingService) => void;
};

const Ctx = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const s = loadStoredSettings();
    setUiLanguage(s.uiLanguage);
    return s;
  });

  setTmdbLanguage(settings.tmdbLanguage);

  useEffect(() => {
    let cancelled = false;
    void loadBgImage().then((img) => {
      if (cancelled || !img) return;
      setSettings((s) => (s.theme.backgroundImage ? s : { ...s, theme: { ...s.theme, backgroundImage: img } }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    let cancelled = false;
    void readSettingsFile().then((raw) => {
      if (cancelled || !raw || localStorage.getItem(STORAGE_KEY)) return;
      try {
        localStorage.setItem(STORAGE_KEY, raw);
        setSettings(loadStoredSettings());
      } catch {}
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const lastSavedImageRef = useRef<string | null>(null);
  useEffect(() => {
    const img = settings.theme.backgroundImage;
    if (img === lastSavedImageRef.current) return;
    lastSavedImageRef.current = img;
    void saveBgImage(img);
  }, [settings.theme.backgroundImage]);

  const fileTimerRef = useRef(0);
  useEffect(() => {
    try {
      const { backgroundImage: _drop, ...themeRest } = settings.theme;
      void _drop;
      const settingsToSave = { ...settings, theme: themeRest };
      const json = JSON.stringify(settingsToSave);
      localStorage.setItem(STORAGE_KEY, json);
      window.clearTimeout(fileTimerRef.current);
      fileTimerRef.current = window.setTimeout(() => void writeSettingsFile(json), 600);
    } catch (e) {
      if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
        console.warn("[settings] localStorage quota exceeded, dropping avatar");
        if (settings.harborAvatar != null) {
          setSettings((s) => ({ ...s, harborAvatar: null }));
        }
      }
    }
  }, [settings]);

  const tmdbLangRef = useRef<string | null>(null);
  useEffect(() => {
    const eff = effectiveTmdbLanguage();
    if (tmdbLangRef.current === null) {
      tmdbLangRef.current = eff;
      return;
    }
    if (tmdbLangRef.current === eff) return;
    tmdbLangRef.current = eff;
    window.location.reload();
  }, [settings.tmdbLanguage, settings.uiLanguage]);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--poster-radius", `${settings.posterRadius}px`);
  }, [settings.posterRadius]);

  useEffect(() => {
    const scale = settings.uiScale > 0 ? settings.uiScale : 1;
    const root = document.getElementById("root") as (HTMLElement & { style: CSSStyleDeclaration & { zoom?: string } }) | null;
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/webview")
        .then(({ getCurrentWebview }) => getCurrentWebview().setZoom(scale))
        .catch(() => {});
      if (root) root.style.zoom = scale !== 1 ? "1" : "";
    } else if (root) {
      root.style.zoom = scale !== 1 ? String(scale) : "";
    }
  }, [settings.uiScale]);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    void import("@tauri-apps/api/core").then(({ invoke }) => {
      if (settings.serveWebUi) invoke("web_serve_start").catch(() => {});
      else invoke("web_serve_stop").catch(() => {});
    });
  }, [settings.serveWebUi]);

  useEffect(() => {
    setPosterBaseUrl(settings.posterBaseUrl);
  }, [settings.posterBaseUrl]);

  useEffect(() => {
    setMdblistBatchKey(settings.mdblistKey);
  }, [settings.mdblistKey]);

  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return;
    const desired = new Map<string, string>();
    for (const f of settings.customFonts ?? []) {
      desired.set(`harbor-font-${f.id}`, f.dataUrl);
    }
    const added: FontFace[] = [];
    desired.forEach((dataUrl, family) => {
      let exists = false;
      document.fonts.forEach((ff) => {
        if (ff.family === family) exists = true;
      });
      if (exists) return;
      try {
        const ff = new FontFace(family, `url(${dataUrl})`, { display: "swap" });
        ff.load()
          .then((loaded) => document.fonts.add(loaded))
          .catch((e) => console.warn("[fonts] failed to load", family, e));
        added.push(ff);
      } catch (e) {
        console.warn("[fonts] FontFace ctor failed", e);
      }
    });
    return () => {
      const stillNeeded = new Set(desired.keys());
      const toRemove: FontFace[] = [];
      document.fonts.forEach((ff) => {
        if (ff.family.startsWith("harbor-font-") && !stillNeeded.has(ff.family)) {
          toRemove.push(ff);
        }
      });
      for (const ff of toRemove) document.fonts.delete(ff);
    };
  }, [settings.customFonts]);


  useEffect(() => {
    void import("@/lib/privacy/blocklist").then(({ setTrackerBlocking }) => {
      setTrackerBlocking(settings.blockTrackers);
    });
  }, [settings.blockTrackers]);

  useEffect(() => {
    void import("@/lib/snapshots").then(({ setSnapshotRetentionDays }) => {
      setSnapshotRetentionDays(settings.cwSnapshotRetentionDays);
    });
  }, [settings.cwSnapshotRetentionDays]);

  useEffect(() => {
    window.__harborStremioDeeplink = settings.stremioDeeplinkInstall;
    if (!("__TAURI_INTERNALS__" in window)) return;
    void import("@tauri-apps/api/core").then(({ invoke }) => {
      void invoke("deeplink_set_stremio", { enabled: settings.stremioDeeplinkInstall }).catch(
        (e) => console.warn("[harbor] deeplink_set_stremio failed", e),
      );
    });
  }, [settings.stremioDeeplinkInstall]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow()
        .setDecorations(settings.useNativeTitleBar)
        .catch((e) => console.warn("[harbor] setDecorations failed", e));
    });
  }, [settings.useNativeTitleBar]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    void import("@tauri-apps/api/core").then(({ invoke }) => {
      void invoke("tray_set_prefs", {
        prefs: {
          closeToTray: settings.closeToTray,
          alwaysOnTop: settings.trayAlwaysOnTop,
          pauseMinimized: settings.pauseMinimized,
          pauseUnfocused: settings.pauseUnfocused,
        },
      }).catch((e) => console.warn("[harbor] tray_set_prefs failed", e));
    });
  }, [settings.closeToTray, settings.trayAlwaysOnTop, settings.pauseMinimized, settings.pauseUnfocused]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<{ closeToTray: boolean; alwaysOnTop: boolean; pauseMinimized: boolean; pauseUnfocused: boolean }>(
        "harbor://tray-prefs",
        (e) => {
          const p = e.payload;
          setSettings((s) => ({
            ...s,
            closeToTray: p.closeToTray,
            trayAlwaysOnTop: p.alwaysOnTop,
            pauseMinimized: p.pauseMinimized,
            pauseUnfocused: p.pauseUnfocused,
          }));
        },
      ).then((u) => {
        if (cancelled) u();
        else unlisten = u;
      }),
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const toggleStreaming = useCallback((svc: StreamingService) => {
    setSettings((s) => ({
      ...s,
      streaming: { ...s.streaming, [svc]: !s.streaming[svc] },
    }));
  }, []);

  const value = useMemo(
    () => ({ settings, update, toggleStreaming }),
    [settings, update, toggleStreaming],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSettings outside SettingsProvider");
  return v;
}
