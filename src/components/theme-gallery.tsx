import { AlertCircle, Check, Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCustomThemes, parseThemeJson, saveCustomTheme, subscribeCustomThemes } from "@/lib/custom-themes";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { applyTheme, type ActiveThemeId } from "@/lib/theme";
import {
  STARTER_GALLERY_THEMES,
  type GalleryTheme,
} from "./theme-gallery-data";

/** Temporarily paints a theme's color tokens on hover, restoring the active theme on leave. */
function useHoverPreview() {
  const { settings } = useSettings();
  const themeRef = useRef(settings.theme);
  themeRef.current = settings.theme;
  const timer = useRef<number | null>(null);
  const previewing = useRef(false);

  const stop = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (previewing.current) {
      previewing.current = false;
      applyTheme(themeRef.current);
    }
  }, []);

  const start = useCallback((tokens?: Record<string, string>) => {
    if (!tokens) return;
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      previewing.current = true;
      const root = document.documentElement;
      for (const [k, v] of Object.entries(tokens)) {
        if (k.startsWith("--color-") && typeof v === "string") root.style.setProperty(k, v);
      }
    }, 220);
  }, []);

  useEffect(() => stop, [stop]);

  return { start, stop };
}

export function ThemeGallery() {
  const { settings, update } = useSettings();
  const [installed, setInstalled] = useState(() => getCustomThemes());
  const preview = useHoverPreview();

  useEffect(() => subscribeCustomThemes(() => setInstalled(getCustomThemes())), []);

  const installedIdByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const ct of installed) m.set(ct.name.trim().toLowerCase(), ct.id);
    return m;
  }, [installed]);

  const install = useCallback(async (entry: GalleryTheme): Promise<string> => {
    const parsed = parseThemeJson(entry.json);
    if (!parsed.ok) throw new Error(parsed.error);
    saveCustomTheme(parsed.theme);
    return parsed.theme.id;
  }, []);

  const apply = useCallback(
    (id: string) => {
      preview.stop();
      update({ theme: { ...settings.theme, preset: id as ActiveThemeId } });
    },
    [preview, settings.theme, update],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STARTER_GALLERY_THEMES.map((entry) => (
          <GalleryCard
            key={entry.name}
            entry={entry}
            installedId={installedIdByName.get(entry.name.trim().toLowerCase()) ?? null}
            activeId={settings.theme.preset}
            onInstall={install}
            onApply={apply}
            onPreviewStart={() => preview.start(entry.tokens)}
            onPreviewStop={preview.stop}
          />
        ))}
      </div>

    </div>
  );
}

function GalleryCard({
  entry,
  installedId,
  activeId,
  onInstall,
  onApply,
  onPreviewStart,
  onPreviewStop,
}: {
  entry: GalleryTheme;
  installedId: string | null;
  activeId: string;
  onInstall: (entry: GalleryTheme) => Promise<string>;
  onApply: (id: string) => void;
  onPreviewStart: () => void;
  onPreviewStop: () => void;
}) {
  const t = useT();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const resetTimer = useRef<number | null>(null);
  const active = installedId != null && activeId === installedId;

  useEffect(
    () => () => {
      if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const onClick = async () => {
    if (state === "loading" || active) return;
    if (installedId) {
      onApply(installedId);
      return;
    }
    setState("loading");
    try {
      const id = await onInstall(entry);
      setState("idle");
      onApply(id);
    } catch {
      setState("error");
      resetTimer.current = window.setTimeout(() => {
        resetTimer.current = null;
        setState("idle");
      }, 2200);
    }
  };

  return (
    <div
      onMouseEnter={onPreviewStart}
      onMouseLeave={onPreviewStop}
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-surface transition-all ${
        active
          ? "border-accent shadow-[0_0_0_2px_var(--color-accent-soft)]"
          : "border-edge-soft hover:border-edge hover:shadow-[0_18px_36px_-22px_rgba(0,0,0,0.3)]"
      }`}
    >
      <div className="relative h-24 w-full" style={{ background: entry.swatch[0] }}>
        <div className="absolute inset-x-3 bottom-3 top-7 rounded-lg" style={{ background: entry.swatch[1] }}>
          <span className="absolute start-3 top-3 block h-2 w-16 rounded-full" style={{ background: entry.swatch[2] }} />
          <span className="absolute start-3 top-7 block h-1.5 w-10 rounded-full opacity-50" style={{ background: entry.swatch[2] }} />
        </div>
        {active && (
          <span className="absolute end-2.5 top-2.5 flex h-6 items-center gap-1 rounded-full bg-accent px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-canvas">
            <Check size={10} strokeWidth={3} /> {t("Active")}
          </span>
        )}
        <div className="absolute bottom-0 left-0 right-0 flex h-1.5">
          {entry.swatch.map((c, i) => (
            <span key={i} className="flex-1" style={{ background: c }} />
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 px-3.5 pb-3.5 pt-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-semibold text-ink">{entry.name}</span>
          <span className="truncate text-[11.5px] text-ink-subtle">
            {t("by {name}", { name: entry.author })}
            {entry.blurb ? ` · ${entry.blurb}` : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={onClick}
          onFocus={onPreviewStart}
          onBlur={onPreviewStop}
          disabled={state === "loading" || active}
          aria-label={
            active
              ? t("{name} is active", { name: entry.name })
              : installedId
                ? t("Apply {name}", { name: entry.name })
                : t("Install {name}", { name: entry.name })
          }
          aria-live="polite"
          className={`flex h-9 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold transition-opacity disabled:opacity-70 ${
            active
              ? "bg-elevated/70 text-ink ring-1 ring-edge"
              : state === "error"
                ? "bg-danger text-white"
                : "bg-ink text-canvas hover:opacity-90"
          }`}
        >
          {state === "loading" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : state === "error" ? (
            <AlertCircle size={13} />
          ) : active ? (
            <Check size={13} strokeWidth={2.5} />
          ) : installedId ? null : (
            <Download size={13} strokeWidth={2.2} />
          )}
          {active
            ? t("Active")
            : state === "error"
              ? t("Failed")
              : state === "loading"
                ? t("Installing…")
                : installedId
                  ? t("Apply")
                  : t("Install")}
        </button>
      </div>
    </div>
  );
}
