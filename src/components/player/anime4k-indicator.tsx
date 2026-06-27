import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "@/lib/settings";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function shadersActive(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export function Anime4kIndicator({ engine, chromeVisible }: { engine: "html5" | "mpv"; chromeVisible: boolean }) {
  const { settings } = useSettings();
  const enabled = settings.playerAnime4kIndicator && engine === "mpv" && isTauri;
  const [active, setActive] = useState(false);
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setActive(false);
      setFps(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const shaders = await invoke("mpv_get_property", { name: "glsl-shaders" }).catch(() => null);
      const on = shadersActive(shaders);
      if (cancelled) return;
      setActive(on);
      if (!on) {
        setFps(null);
        return;
      }
      const f = await invoke<number>("mpv_get_property", { name: "estimated-vf-fps" }).catch(() => null);
      if (!cancelled) setFps(typeof f === "number" && f > 0 ? Math.round(f) : null);
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled]);

  if (!active) return null;

  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-[3.25rem] z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-edge-soft bg-canvas/85 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-ink/85 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md transition-opacity duration-300 ${chromeVisible ? "opacity-100" : "opacity-0"}`}
    >
      <Sparkles size={13} className="text-accent" />
      <span>Anime4K</span>
      {settings.playerAnime4kMode && <span className="text-ink-subtle">{settings.playerAnime4kMode}</span>}
      {fps != null && <span className="tabular-nums text-ink-muted">{fps} fps</span>}
    </div>
  );
}
