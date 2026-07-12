import {
  emptySnapshot,
  type PlayerBridge,
  type PlayerCapabilities,
  type PlayerSnapshot,
  type PlayerSource,
  type SubtitleStyle,
  type TrackInfo,
} from "../bridge";
import { fetchAndParse, findActiveCue, type SubCue } from "@/lib/subtitles/parser";

// Bridge over the native ExoPlayer (media3) exposed by the Android app as
// window.HarborExo. The native PlayerView is composited BEHIND a transparent
// WebView (same model as desktop mpv-embed): while attached we flag the page
// transparent (data-exo-active) so the native video shows through the player
// stage, and setVisible toggles the native surface.
//
// Subtitle strategy (only ONE renderer active at a time):
//   - EXTERNAL text subs (addon/search) render via Harbor's JS cue overlay
//     (fetchAndParse + snap.subText) so delay, styles and presets all work.
//     While one is active the native text renderer is turned off (setSubTrack
//     "off").
//   - EMBEDDED tracks stay native; selecting one clears the JS overlay and
//     Harbor's subtitle style is mapped onto setSubStyle (best-effort).

type ExoTrack = { id: string; label?: string; lang?: string; selected?: boolean };

type ExoState = {
  position?: number;
  duration?: number;
  buffered?: number;
  paused?: boolean;
  buffering?: boolean;
  ended?: boolean;
  speed?: number;
  volume?: number;
  muted?: boolean;
  videoWidth?: number;
  videoHeight?: number;
  pip?: boolean;
  resizeMode?: "fit" | "fill" | "zoom";
  audioTracks?: ExoTrack[];
  subTracks?: ExoTrack[];
  error?: string | null;
};

type HarborExoApi = {
  init(): string;
  load(json: string): string;
  play(): string;
  pause(): string;
  stop(): string;
  seek(sec: string): string;
  setSpeed(v: string): string;
  setVolume(v: string): string;
  setMuted(v: string): string;
  setAudioTrack(id: string): string;
  setSubTrack(id: string): string;
  setVisible(v: string): string;
  screenshot(): string;
  setResize(mode: string): string;
  setAbLoop(json: string): string;
  addSubtitle(json: string): string;
  setSubStyle(json: string): string;
  enterPip(): string;
  getState(): string;
  destroy(): string;
};

declare global {
  interface Window {
    HarborExo?: Partial<HarborExoApi>;
    __HARBOR_EXO_EVENT__?: (payload: {
      type: string;
      state?: ExoState;
      active?: boolean;
    }) => void;
  }
}

export function hasHarborExo(): boolean {
  return typeof window !== "undefined" && !!window.HarborExo;
}

type JsSub = {
  id: string;
  url: string;
  lang?: string;
  title?: string;
  cues: SubCue[] | null;
  loading: boolean;
};

export function createExoBridge(): PlayerBridge {
  let host: HTMLElement | null = null;
  let snap: PlayerSnapshot = { ...emptySnapshot };
  const listeners = new Set<(s: PlayerSnapshot) => void>();

  // Native state arrives every ~500ms; interpolate position between events.
  let authPos = 0;
  let authAt = 0;
  let authSpeed = 1;
  let authPaused = true;
  let posTicker: number | null = null;

  // Resize is derived from the mpv-style panscan/zoom calls the player emits.
  let panscan = 0;
  let zoom = 0;

  // Subtitle state.
  const jsSubs: JsSub[] = [];
  let nativeSubs: ExoTrack[] = [];
  let selectedKind: "js" | "native" | null = null;
  let activeJsId: string | null = null;
  let lastSubId: string | null = null;
  let subDelaySec = 0;
  let subVisible = true;
  let cueRaf: number | null = null;
  let lastCueId = "";

  const emit = () => {
    const next: PlayerSnapshot = { ...snap };
    listeners.forEach((l) => l(next));
  };

  function invokeExo<K extends keyof HarborExoApi>(name: K, arg?: string): string {
    const api = typeof window !== "undefined" ? window.HarborExo : undefined;
    const fn = api?.[name];
    if (typeof fn !== "function") return "error:HarborExo." + String(name) + " unavailable";
    try {
      return (arg === undefined ? (fn as () => string)() : (fn as (a: string) => string)(arg)) ?? "ok";
    } catch (e) {
      return "error:" + (e instanceof Error ? e.message : String(e));
    }
  }

  const interpPosition = (): number => {
    if (authPaused) return authPos;
    const predicted = authPos + ((performance.now() - authAt) / 1000) * authSpeed;
    return snap.durationSec > 0 ? Math.min(predicted, snap.durationSec) : predicted;
  };

  const managePosTicker = () => {
    const run = !authPaused && host != null;
    if (run && posTicker == null) {
      posTicker = window.setInterval(() => {
        snap.positionSec = interpPosition();
        emit();
      }, 250);
    } else if (!run && posTicker != null) {
      window.clearInterval(posTicker);
      posTicker = null;
    }
  };

  const audioInfo = (t: ExoTrack): TrackInfo => ({
    id: t.id,
    label: t.label || (t.lang ? t.lang.toUpperCase() : "Audio"),
    lang: t.lang,
    kind: "audio",
    selected: t.selected === true,
  });

  const rebuildSubtitleTracks = () => {
    const jsInfos: TrackInfo[] = jsSubs.map((t) => ({
      id: t.id,
      label: t.title || (t.lang ? t.lang.toUpperCase() : "Subtitle"),
      lang: t.lang,
      kind: "subtitle",
      selected: selectedKind === "js" && t.id === activeJsId,
      external: true,
      url: t.url,
    }));
    const nativeInfos: TrackInfo[] = nativeSubs.map((t) => ({
      id: t.id,
      label: t.label || (t.lang ? t.lang.toUpperCase() : "Subtitle"),
      lang: t.lang,
      kind: "subtitle",
      selected: selectedKind === "native" && t.selected === true,
    }));
    snap.subtitleTracks = [...jsInfos, ...nativeInfos];
  };

  const tickCues = () => {
    if (selectedKind !== "js" || !subVisible) {
      if (snap.subText !== "") {
        snap.subText = "";
        snap.subStartSec = 0;
        emit();
      }
      return;
    }
    const track = jsSubs.find((s) => s.id === activeJsId);
    if (!track || !track.cues) return;
    const cue = findActiveCue(track.cues, interpPosition() - subDelaySec);
    const cueId = cue ? `${cue.start}|${cue.text}` : "";
    if (cueId === lastCueId) return;
    lastCueId = cueId;
    snap.subText = cue?.text ?? "";
    snap.subStartSec = cue?.start ?? 0;
    emit();
  };

  const cueLoop = () => {
    cueRaf = null;
    tickCues();
    if (selectedKind === "js") cueRaf = window.requestAnimationFrame(cueLoop);
  };
  const startCueLoop = () => {
    if (cueRaf == null) cueRaf = window.requestAnimationFrame(cueLoop);
  };
  const stopCueLoop = () => {
    if (cueRaf != null) {
      window.cancelAnimationFrame(cueRaf);
      cueRaf = null;
    }
  };

  const ensureJsLoaded = async (track: JsSub) => {
    if (track.cues || track.loading) return;
    track.loading = true;
    try {
      track.cues = await fetchAndParse(track.url);
    } catch (e) {
      console.warn(`[exo] subtitle load failed ${track.url}`, e);
      track.cues = [];
    } finally {
      track.loading = false;
      lastCueId = "";
      tickCues();
    }
  };

  const applyResize = () => {
    const mode = zoom > 0 ? "zoom" : panscan >= 1 ? "fill" : "fit";
    invokeExo("setResize", mode);
  };

  const applyState = (st: ExoState) => {
    if (!st) return;
    if (typeof st.position === "number") {
      snap.positionSec = st.position;
      authPos = st.position;
      authAt = performance.now();
    }
    if (typeof st.duration === "number") snap.durationSec = st.duration >= 0 ? st.duration : 0;
    if (typeof st.buffered === "number") snap.bufferedSec = Math.max(0, st.buffered);
    if (typeof st.speed === "number") {
      snap.rate = st.speed;
      authSpeed = st.speed || 1;
    }
    if (typeof st.volume === "number") snap.volume = st.volume;
    if (typeof st.muted === "boolean") snap.muted = st.muted;
    if (typeof st.videoWidth === "number") snap.videoWidth = st.videoWidth;
    if (typeof st.videoHeight === "number") snap.videoHeight = st.videoHeight;
    if (typeof st.pip === "boolean") snap.pip = st.pip;
    if (st.audioTracks) snap.audioTracks = st.audioTracks.map(audioInfo);
    if (st.subTracks) {
      nativeSubs = st.subTracks;
      rebuildSubtitleTracks();
    }
    authPaused = st.paused === true;
    if (st.error) {
      snap.status = "error";
      snap.errorMessage = st.error;
      snap.errorCode = "source";
    } else if (st.ended === true) {
      snap.status = "ended";
      snap.buffering = false;
    } else if (st.buffering === true) {
      snap.status = "loading";
      snap.buffering = true;
    } else if (st.paused === true) {
      snap.status = "paused";
      snap.buffering = false;
    } else {
      snap.status = "playing";
      snap.buffering = false;
    }
    emit();
    managePosTicker();
  };

  const handleEvent = (payload: { type: string; state?: ExoState; active?: boolean }) => {
    if (!payload) return;
    if (payload.type === "state" && payload.state) applyState(payload.state);
    else if (payload.type === "pip") {
      snap.pip = payload.active === true;
      emit();
    } else if (payload.type === "lifecycle") {
      // Persist watch progress before Android may kill the backgrounded process.
      if ((payload as { state?: string }).state === "background") {
        window.dispatchEvent(new Event("vayra:flush-persist"));
      }
    }
  };

  const buildLoadPayload = (src: PlayerSource, startSec?: number) => ({
    url: src.url,
    startSec: startSec ?? src.startAtSec ?? undefined,
    headers: src.headers ?? undefined,
    // External subs are rendered by the JS overlay, so they are NOT passed to
    // media3 here (that would double-render); embedded tracks come from the file.
  });

  const selectJs = (id: string) => {
    selectedKind = "js";
    activeJsId = id;
    lastSubId = id;
    invokeExo("setSubTrack", "off");
    const track = jsSubs.find((s) => s.id === id);
    if (track) void ensureJsLoaded(track);
    lastCueId = "";
    rebuildSubtitleTracks();
    startCueLoop();
    tickCues();
    emit();
  };

  const selectNative = (id: string) => {
    selectedKind = "native";
    activeJsId = null;
    lastSubId = id;
    stopCueLoop();
    snap.subText = "";
    snap.subStartSec = 0;
    invokeExo("setSubTrack", id);
    rebuildSubtitleTracks();
    emit();
  };

  const selectNone = () => {
    selectedKind = null;
    activeJsId = null;
    stopCueLoop();
    snap.subText = "";
    snap.subStartSec = 0;
    invokeExo("setSubTrack", "off");
    rebuildSubtitleTracks();
    emit();
  };

  return {
    attach(h) {
      host = h;
      h.style.background = "transparent";
      if (typeof document !== "undefined") document.documentElement.dataset.exoActive = "1";
      window.__HARBOR_EXO_EVENT__ = handleEvent;
      invokeExo("init");
      invokeExo("setVisible", "true");
      const raw = invokeExo("getState");
      if (raw && !raw.startsWith("error")) {
        try {
          applyState(JSON.parse(raw) as ExoState);
        } catch {
          /* ignore malformed state */
        }
      }
    },
    detach() {
      invokeExo("setVisible", "false");
      if (typeof document !== "undefined") delete document.documentElement.dataset.exoActive;
      if (host) host.style.background = "";
      host = null;
    },
    async load(src: PlayerSource) {
      jsSubs.length = 0;
      nativeSubs = [];
      selectedKind = null;
      activeJsId = null;
      lastSubId = null;
      subDelaySec = 0;
      lastCueId = "";
      stopCueLoop();
      snap = { ...emptySnapshot, status: "loading" };
      authPos = src.startAtSec ?? 0;
      authAt = performance.now();
      authPaused = false;
      if (src.subtitles?.length) {
        src.subtitles.forEach((s, i) => {
          jsSubs.push({
            id: s.id ?? `js-seed-${i}`,
            url: s.url,
            lang: s.lang,
            title: undefined,
            cues: null,
            loading: false,
          });
        });
      }
      rebuildSubtitleTracks();
      emit();
      const res = invokeExo("load", JSON.stringify(buildLoadPayload(src)));
      if (res.startsWith("error")) {
        snap.status = "error";
        snap.errorCode = "source";
        snap.errorMessage = res.slice("error:".length) || "exo load failed";
        emit();
      }
    },
    async play() {
      invokeExo("play");
    },
    pause() {
      invokeExo("pause");
    },
    seek(sec) {
      authPos = sec;
      authAt = performance.now();
      snap.positionSec = sec;
      lastCueId = "";
      emit();
      invokeExo("seek", String(sec));
    },
    setVolume(v) {
      snap.volume = v;
      emit();
      invokeExo("setVolume", String(v));
    },
    setMuted(m) {
      snap.muted = m;
      emit();
      invokeExo("setMuted", String(m));
    },
    setRate(r) {
      authSpeed = r || 1;
      snap.rate = r;
      emit();
      invokeExo("setSpeed", String(r));
    },
    setAudioTrack(id) {
      invokeExo("setAudioTrack", id);
    },
    setSubtitleTrack(id) {
      if (id == null) return selectNone();
      if (jsSubs.some((s) => s.id === id)) return selectJs(id);
      return selectNative(id);
    },
    setSubVisible(on) {
      subVisible = on;
      if (selectedKind === "native") invokeExo("setSubTrack", on ? lastSubId ?? "off" : "off");
      else tickCues();
    },
    setSubStyle(style: SubtitleStyle) {
      invokeExo("setSubStyle", JSON.stringify(style));
    },
    setSubDelay(sec) {
      subDelaySec = sec;
      snap.subDelaySec = sec;
      lastCueId = "";
      tickCues();
      emit();
    },
    setAudioDelay() {},
    setPanscan(value) {
      panscan = value;
      applyResize();
    },
    setStretch() {},
    setVideoEq() {},
    setVideoZoom(log2) {
      zoom = log2;
      applyResize();
    },
    setAspectOverride() {
      // media3 setResize supports fit/fill/zoom only; fixed aspect ratios n/a.
    },
    setAnime4kShaders() {},
    async addSubtitle(url, lang, title, select): Promise<boolean> {
      const id = `js-ext-${jsSubs.length}-${Date.now()}`;
      jsSubs.push({ id, url, lang, title, cues: null, loading: false });
      rebuildSubtitleTracks();
      if (select === true) selectJs(id);
      else emit();
      return true;
    },
    getSelectedTrackCues() {
      if (selectedKind !== "js") return null;
      return jsSubs.find((s) => s.id === activeJsId)?.cues ?? null;
    },
    getSelectedTrackUrl() {
      if (selectedKind !== "js") return null;
      return jsSubs.find((s) => s.id === activeJsId)?.url ?? null;
    },
    setAudioNormalize() {},
    async screenshot(path) {
      const dataUrl = invokeExo("screenshot");
      if (!dataUrl || !dataUrl.startsWith("data:")) {
        return { ok: false, error: dataUrl.startsWith("error") ? dataUrl.slice(6) : "screenshot failed" };
      }
      try {
        const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const fs = await import("@tauri-apps/plugin-fs");
        const dir = path.replace(/[\\/][^\\/]+$/, "");
        if (dir && dir !== path) await fs.mkdir(dir, { recursive: true }).catch(() => {});
        await fs.writeFile(path, bytes);
        return { ok: true, path };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    setAbLoop(a, b) {
      if (a == null || b == null) invokeExo("setAbLoop", "off");
      else invokeExo("setAbLoop", JSON.stringify({ a, b }));
    },
    async requestPiP() {
      invokeExo("enterPip");
    },
    async exitPiP() {},
    async requestFullscreen() {
      if (host && typeof host.requestFullscreen === "function") {
        await host.requestFullscreen().catch(() => {});
      }
    },
    async exitFullscreen() {
      if (typeof document.exitFullscreen === "function") {
        await document.exitFullscreen().catch(() => {});
      }
    },
    capabilities(): PlayerCapabilities {
      return {
        engine: "exo",
        pictureInPicture: true,
        airplay: false,
        chromecast: false,
        hdrPassthrough: false,
        hardwareDecode: true,
      };
    },
    subscribe(l) {
      listeners.add(l);
      l(snap);
      return () => {
        listeners.delete(l);
      };
    },
    destroy() {
      if (posTicker != null) {
        window.clearInterval(posTicker);
        posTicker = null;
      }
      stopCueLoop();
      invokeExo("setVisible", "false");
      invokeExo("stop");
      invokeExo("destroy");
      if (window.__HARBOR_EXO_EVENT__ === handleEvent) delete window.__HARBOR_EXO_EVENT__;
      if (typeof document !== "undefined") delete document.documentElement.dataset.exoActive;
      if (host) host.style.background = "";
      host = null;
      jsSubs.length = 0;
      listeners.clear();
    },
  };
}
