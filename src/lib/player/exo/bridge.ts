import {
  emptySnapshot,
  type PlayerBridge,
  type PlayerCapabilities,
  type PlayerSnapshot,
  type PlayerSource,
  type TrackInfo,
} from "../bridge";

// Bridge over the native ExoPlayer (media3) exposed by the Android app as
// window.HarborExo. The native PlayerView is composited BEHIND a transparent
// WebView (same model as desktop mpv-embed): while this bridge is attached we
// flag the page transparent (data-exo-active) so the native video shows through
// the player stage, and setVisible toggles the native surface.
//
// Subtitles: the native path. External subs are handed to media3 via load().subs
// so it renders both embedded and external tracks itself (the JS cue-overlay is
// not used — it could not render embedded MKV tracks, which would be incoherent).

type ExoTrack = { id: string; label?: string; lang?: string; selected?: boolean };

type ExoState = {
  position?: number;
  duration?: number;
  paused?: boolean;
  buffering?: boolean;
  ended?: boolean;
  speed?: number;
  volume?: number;
  muted?: boolean;
  videoWidth?: number;
  videoHeight?: number;
  audioTracks?: ExoTrack[];
  subTracks?: ExoTrack[];
  error?: string | null;
};

type ExoSub = { url: string; lang?: string; label?: string; mime?: string };

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
  getState(): string;
  destroy(): string;
};

declare global {
  interface Window {
    HarborExo?: HarborExoApi;
    __HARBOR_EXO_EVENT__?: (payload: { type: string; state?: ExoState }) => void;
  }
}

export function hasHarborExo(): boolean {
  return typeof window !== "undefined" && !!window.HarborExo;
}

export function createExoBridge(): PlayerBridge {
  let host: HTMLElement | null = null;
  let snap: PlayerSnapshot = { ...emptySnapshot };
  const listeners = new Set<(s: PlayerSnapshot) => void>();
  let lastSource: PlayerSource | null = null;
  let extraSubs: ExoSub[] = [];
  let lastSubId: string | null = null;

  // Native state arrives every ~500ms; interpolate position between events so
  // the seek bar and clock stay smooth (the html5 bridge updates ~4x/s too).
  let authPos = 0;
  let authAt = 0;
  let authSpeed = 1;
  let authPaused = true;
  let ticker: number | null = null;

  const emit = () => {
    const next: PlayerSnapshot = { ...snap };
    listeners.forEach((l) => l(next));
  };

  function invokeExo(action: (a: HarborExoApi) => string): string {
    const a = typeof window !== "undefined" ? window.HarborExo : undefined;
    if (!a) return "error:HarborExo unavailable";
    try {
      return action(a);
    } catch (e) {
      return "error:" + (e instanceof Error ? e.message : String(e));
    }
  }

  const toTracks = (list: ExoTrack[] | undefined, kind: "audio" | "subtitle"): TrackInfo[] =>
    (list ?? []).map((t) => ({
      id: t.id,
      label: t.label || (t.lang ? t.lang.toUpperCase() : kind === "audio" ? "Audio" : "Subtitle"),
      lang: t.lang,
      kind,
      selected: t.selected === true,
    }));

  const manageTicker = () => {
    const shouldRun = !authPaused && host != null;
    if (shouldRun && ticker == null) {
      ticker = window.setInterval(() => {
        const predicted = authPos + ((performance.now() - authAt) / 1000) * authSpeed;
        snap.positionSec = snap.durationSec > 0 ? Math.min(predicted, snap.durationSec) : predicted;
        emit();
      }, 250);
    } else if (!shouldRun && ticker != null) {
      window.clearInterval(ticker);
      ticker = null;
    }
  };

  const applyState = (st: ExoState) => {
    if (!st) return;
    if (typeof st.position === "number") {
      snap.positionSec = st.position;
      authPos = st.position;
      authAt = performance.now();
    }
    if (typeof st.duration === "number") snap.durationSec = st.duration >= 0 ? st.duration : 0;
    if (typeof st.speed === "number") {
      snap.rate = st.speed;
      authSpeed = st.speed || 1;
    }
    if (typeof st.volume === "number") snap.volume = st.volume;
    if (typeof st.muted === "boolean") snap.muted = st.muted;
    if (typeof st.videoWidth === "number") snap.videoWidth = st.videoWidth;
    if (typeof st.videoHeight === "number") snap.videoHeight = st.videoHeight;
    if (st.audioTracks) snap.audioTracks = toTracks(st.audioTracks, "audio");
    if (st.subTracks) {
      snap.subtitleTracks = toTracks(st.subTracks, "subtitle");
      const sel = snap.subtitleTracks.find((t) => t.selected);
      if (sel) lastSubId = sel.id;
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
    manageTicker();
  };

  const handleEvent = (payload: { type: string; state?: ExoState }) => {
    if (payload && payload.type === "state" && payload.state) applyState(payload.state);
  };

  const buildLoadPayload = (src: PlayerSource, startSec?: number) => ({
    url: src.url,
    startSec: startSec ?? src.startAtSec ?? undefined,
    headers: src.headers ?? undefined,
    subs: [
      ...(src.subtitles ?? []).map((s) => ({ url: s.url, lang: s.lang, mime: s.m })),
      ...extraSubs,
    ],
  });

  return {
    attach(h) {
      host = h;
      h.style.background = "transparent";
      if (typeof document !== "undefined") document.documentElement.dataset.exoActive = "1";
      window.__HARBOR_EXO_EVENT__ = handleEvent;
      invokeExo((a) => a.init());
      invokeExo((a) => a.setVisible("true"));
      const raw = invokeExo((a) => a.getState());
      if (raw && !raw.startsWith("error")) {
        try {
          applyState(JSON.parse(raw) as ExoState);
        } catch {
          /* ignore malformed state */
        }
      }
    },
    detach() {
      invokeExo((a) => a.setVisible("false"));
      if (typeof document !== "undefined") delete document.documentElement.dataset.exoActive;
      if (host) host.style.background = "";
      host = null;
    },
    async load(src: PlayerSource) {
      lastSource = src;
      extraSubs = [];
      lastSubId = null;
      snap = { ...emptySnapshot, status: "loading" };
      authPos = 0;
      authAt = performance.now();
      authPaused = false;
      emit();
      const res = invokeExo((a) => a.load(JSON.stringify(buildLoadPayload(src))));
      if (res.startsWith("error")) {
        snap.status = "error";
        snap.errorCode = "source";
        snap.errorMessage = res.slice("error:".length) || "exo load failed";
        emit();
      }
    },
    async play() {
      invokeExo((a) => a.play());
    },
    pause() {
      invokeExo((a) => a.pause());
    },
    seek(sec) {
      authPos = sec;
      authAt = performance.now();
      snap.positionSec = sec;
      emit();
      invokeExo((a) => a.seek(String(sec)));
    },
    setVolume(v) {
      snap.volume = v;
      emit();
      invokeExo((a) => a.setVolume(String(v)));
    },
    setMuted(m) {
      snap.muted = m;
      emit();
      invokeExo((a) => a.setMuted(String(m)));
    },
    setRate(r) {
      authSpeed = r || 1;
      snap.rate = r;
      emit();
      invokeExo((a) => a.setSpeed(String(r)));
    },
    setAudioTrack(id) {
      invokeExo((a) => a.setAudioTrack(id));
    },
    setSubtitleTrack(id) {
      lastSubId = id;
      invokeExo((a) => a.setSubTrack(id ?? "off"));
    },
    setSubVisible(on) {
      invokeExo((a) => a.setSubTrack(on ? lastSubId ?? "off" : "off"));
    },
    // Native player exposes no sub/audio delay, panscan, zoom, aspect, shaders,
    // AB-loop or normalize controls; their UI is hidden for the exo engine.
    setSubDelay() {},
    setAudioDelay() {},
    setPanscan() {},
    setVideoZoom() {},
    setAspectOverride() {},
    setAnime4kShaders() {},
    async addSubtitle(url, lang, title): Promise<boolean> {
      // media3 has no runtime add-subtitle; re-issue load() with the extra track
      // appended, preserving the current position. The track then appears in the
      // menu for selection.
      extraSubs.push({ url, lang, label: title });
      if (!lastSource) return false;
      const res = invokeExo((a) =>
        a.load(JSON.stringify(buildLoadPayload(lastSource!, snap.positionSec))),
      );
      return !res.startsWith("error");
    },
    getSelectedTrackCues() {
      return null;
    },
    getSelectedTrackUrl() {
      return null;
    },
    setAudioNormalize() {},
    async screenshot() {
      return { ok: false, error: "Screenshot isn't supported by the native player." };
    },
    setAbLoop() {},
    async requestPiP() {},
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
        pictureInPicture: false,
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
      if (ticker != null) {
        window.clearInterval(ticker);
        ticker = null;
      }
      invokeExo((a) => a.setVisible("false"));
      invokeExo((a) => a.stop());
      invokeExo((a) => a.destroy());
      if (window.__HARBOR_EXO_EVENT__ === handleEvent) delete window.__HARBOR_EXO_EVENT__;
      if (typeof document !== "undefined") delete document.documentElement.dataset.exoActive;
      if (host) host.style.background = "";
      host = null;
      listeners.clear();
    },
  };
}
