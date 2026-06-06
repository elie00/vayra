import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PlayerBridge, PlayerSnapshot } from "@/lib/player/bridge";
import { getPlaybackBuffered, getPlaybackPosition, usePlaybackFlag } from "@/lib/player/playback-clock";
import { isLocalUrl } from "@/lib/player/local-url";
import { clearOnePickerCache } from "@/lib/picker-cache";
import { resolveViaDebrids } from "@/lib/streams/resolve";
import { registerStreamProxy } from "@/lib/stream-proxy";
import { buildTranscodedUrl, isBundledEngineUrl, probeStremioServer } from "@/lib/stremio-server";
import type { DebridStore } from "@/lib/debrid/types";
import type { Meta } from "@/lib/cinemeta";
import type { PlayerSrc, PlayEpisode } from "@/lib/view";
import { BLACK_SCREEN_GRACE_MS, MAX_AUTORETRY_ATTEMPTS, ROOM_STALL_MS, SLOW_LOAD_MS, STUCK_AUTORETRY_MS } from "../player-utils";

type OpenPicker = (
  meta: Meta,
  episode?: PlayEpisode,
  opts?: { autoPlay?: boolean; attempt?: number },
) => void;

export function useAutoRetry(params: {
  bridgeRef: RefObject<PlayerBridge | null>;
  src: PlayerSrc;
  snap: PlayerSnapshot;
  stremioServerTranscode: boolean;
  instantPlay: boolean;
  inRoom: boolean;
  debrids: DebridStore[];
  selfFrameReadyRef: RefObject<boolean>;
  openPicker: OpenPicker;
}) {
  const { bridgeRef, src, snap, stremioServerTranscode, instantPlay, inRoom, debrids, selfFrameReadyRef, openPicker } = params;
  const isLocal = isLocalUrl(src.url);
  const isBundledEngine = isBundledEngineUrl(src.url);
  const isLive = src.meta.id.startsWith("iptv:");

  const hasProgress = usePlaybackFlag(
    () => getPlaybackPosition() > 0.5 || getPlaybackBuffered() > 0.5,
  );
  const [slowLoad, setSlowLoad] = useState(false);
  useEffect(() => {
    setSlowLoad(false);
    if (isLocal) return;
    const hasMeaningful = snap.durationSec > 0 && hasProgress;
    if (hasMeaningful) return;
    const t = window.setTimeout(() => setSlowLoad(true), SLOW_LOAD_MS);
    return () => window.clearTimeout(t);
  }, [src.url, snap.durationSec, hasProgress, isLocal]);

  const autoRetriedRef = useRef(false);
  const transcodedTriedRef = useRef(false);
  const sameUrlRetriedRef = useRef(false);
  const debridFailoverTriedRef = useRef(false);
  const liveRetryCountRef = useRef(0);
  const [transcodedUrl, setTranscodedUrl] = useState<string | null>(null);
  useEffect(() => {
    autoRetriedRef.current = false;
    transcodedTriedRef.current = false;
    sameUrlRetriedRef.current = false;
    debridFailoverTriedRef.current = false;
    liveRetryCountRef.current = 0;
    setTranscodedUrl(null);
  }, [src.url]);

  useEffect(() => {
    if (!isLive) return;
    if (snap.errorCode == null) return;
    if (liveRetryCountRef.current >= 2) return;
    const b = bridgeRef.current;
    if (!b) return;
    const attempt = liveRetryCountRef.current + 1;
    const timer = window.setTimeout(() => {
      liveRetryCountRef.current = attempt;
      console.warn(`[player] live auto-reconnect attempt ${attempt}/2`);
      void b.load({
        url: src.url,
        subtitles: src.subtitles,
        notWebReady: src.notWebReady,
      });
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [isLive, snap.errorCode, src.url, src.subtitles, src.notWebReady, bridgeRef]);

  const triggerAutoRetry = useCallback(
    (reason: string) => {
      if (autoRetriedRef.current) return;
      if (isLocal) {
        console.warn(`[player] local file: skipping auto-retry (${reason})`);
        return;
      }
      if (isLive) {
        console.warn(`[player] live channel: skipping auto-retry (${reason})`);
        return;
      }
      const currentAttempt = src.attempt ?? 0;
      if (currentAttempt >= MAX_AUTORETRY_ATTEMPTS) {
        console.warn(`[player] giving up after ${currentAttempt} attempts (${reason})`);
        return;
      }
      autoRetriedRef.current = true;
      const nextAttempt = currentAttempt + 1;
      console.warn(`[player] ${reason} — retrying with candidate #${nextAttempt}`);
      if (bridgeRef.current) {
        bridgeRef.current.destroy();
        bridgeRef.current = null;
      }
      if (nextAttempt >= 2) {
        clearOnePickerCache(src.meta, src.episode);
      }
      openPicker(
        src.meta,
        src.episode,
        instantPlay || inRoom
          ? { autoPlay: true, attempt: nextAttempt }
          : { autoPlay: false },
      );
    },
    [src.attempt, src.meta, src.episode, openPicker, instantPlay, isLocal, isLive, inRoom, src.url, src.subtitles, src.notWebReady, bridgeRef],
  );

  useEffect(() => {
    if (snap.errorCode == null) return;
    if (snap.status === "ended") return;
    if (isLive) {
      console.warn(`[player] live channel: ignoring "${snap.errorCode}", mpv handles reconnection`);
      return;
    }
    if (getPlaybackPosition() > 5) return;
    const failoverHash = src.streamRef?.infoHash;
    if (failoverHash && debrids.length > 0 && !debridFailoverTriedRef.current) {
      debridFailoverTriedRef.current = true;
      const cached = Object.fromEntries((src.streamRef?.cachedSlugs ?? []).map((s) => [s, true]));
      const ac = new AbortController();
      void resolveViaDebrids(failoverHash, src.streamRef?.fileIdx ?? undefined, cached, debrids, ac.signal, false).then(
        async (r) => {
          const b = bridgeRef.current;
          if (r.ok && b) {
            let url = r.data.url;
            if (r.data.headers && Object.keys(r.data.headers).length > 0) {
              try {
                url = (await registerStreamProxy(r.data.url, r.data.headers)).url;
              } catch {
                /* fall back to the raw debrid url */
              }
            }
            console.warn(`[player] debrid failover via ${r.via}`);
            void b.load({ url, subtitles: src.subtitles, notWebReady: r.data.notWebReady ?? src.notWebReady });
          } else {
            triggerAutoRetry(`playback error "${snap.errorCode}"`);
          }
        },
      );
      return;
    }
    if (!sameUrlRetriedRef.current) {
      sameUrlRetriedRef.current = true;
      const b = bridgeRef.current;
      if (b) {
        console.warn(`[player] error "${snap.errorCode}" before playback — reloading same URL`);
        void b.load({
          url: src.url,
          subtitles: src.subtitles,
          notWebReady: src.notWebReady,
        });
        return;
      }
    }
    if (
      stremioServerTranscode &&
      !transcodedTriedRef.current &&
      snap.errorCode === "decode" &&
      transcodedUrl == null
    ) {
      transcodedTriedRef.current = true;
      void probeStremioServer().then((ok) => {
        if (ok) {
          console.warn("[player] decode error — retrying via stremio-server transcoding");
          if (bridgeRef.current) {
            bridgeRef.current.destroy();
            bridgeRef.current = null;
          }
          setTranscodedUrl(buildTranscodedUrl(src.url));
        } else {
          triggerAutoRetry(`playback error "${snap.errorCode}"`);
        }
      });
      return;
    }
    triggerAutoRetry(`playback error "${snap.errorCode}"`);
  }, [
    snap.errorCode,
    snap.status,
    triggerAutoRetry,
    stremioServerTranscode,
    transcodedUrl,
    src.url,
    src.subtitles,
    src.notWebReady,
    bridgeRef,
  ]);

  const lastPosRef = useRef({ pos: 0, at: 0, started: false, urlAt: 0 });
  useEffect(() => {
    lastPosRef.current = { pos: 0, at: 0, started: false, urlAt: Date.now() };
  }, [src.url]);
  useEffect(() => {
    if (snap.status !== "playing") {
      lastPosRef.current.at = Date.now();
      lastPosRef.current.pos = getPlaybackPosition();
      lastPosRef.current.started = false;
      return;
    }
    const id = window.setInterval(() => {
      const now = Date.now();
      const ref = lastPosRef.current;
      const pos = getPlaybackPosition();
      if (!ref.started) {
        ref.started = true;
        ref.at = now;
        ref.pos = pos;
        return;
      }
      if (pos > ref.pos + 0.3) {
        ref.pos = pos;
        ref.at = now;
        return;
      }
      if (ref.pos > 5) return;
      const neverStarted = ref.pos < 0.5;
      const graceMs = neverStarted ? 75_000 : 18_000;
      if (now - ref.urlAt < graceMs) return;
      if (!isBundledEngine && now - ref.at > graceMs && pos < 5) {
        triggerAutoRetry(neverStarted ? "source did not start after 75s" : "position frozen for 18s");
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [snap.status, triggerAutoRetry, src.url, isBundledEngine]);

  const noVideoSinceRef = useRef<number | null>(null);
  const videoSeenRef = useRef(false);
  useEffect(() => {
    videoSeenRef.current = false;
    noVideoSinceRef.current = null;
  }, [src.url]);
  useEffect(() => {
    const hasVideo = snap.videoWidth > 0 && snap.videoHeight > 0;
    if (hasVideo) {
      videoSeenRef.current = true;
      noVideoSinceRef.current = null;
      return;
    }
    if (snap.status !== "playing") {
      noVideoSinceRef.current = null;
      return;
    }
    if (videoSeenRef.current) return;
    if (noVideoSinceRef.current == null) {
      noVideoSinceRef.current = Date.now();
      return;
    }
    if (Date.now() - noVideoSinceRef.current > BLACK_SCREEN_GRACE_MS) {
      triggerAutoRetry("audio plays but no video frames (black screen)");
    }
  }, [snap.status, snap.videoWidth, snap.videoHeight, triggerAutoRetry, src.url]);

  useEffect(() => {
    if (snap.status === "ended") return;
    if (isBundledEngine) return;
    if (snap.durationSec > 0 || getPlaybackPosition() > 1) return;
    const t = window.setTimeout(() => {
      if (snap.durationSec === 0 && getPlaybackPosition() === 0) {
        triggerAutoRetry("stuck on load");
      }
    }, STUCK_AUTORETRY_MS);
    return () => window.clearTimeout(t);
  }, [src.url, snap.durationSec, snap.status, triggerAutoRetry, isBundledEngine]);

  useEffect(() => {
    if (!inRoom || isLocal || isLive) return;
    if (selfFrameReadyRef.current) return;
    if (snap.status === "ended") return;
    if (snap.videoWidth > 0 && snap.videoHeight > 0) return;
    const t = window.setTimeout(() => {
      if (!selfFrameReadyRef.current && (snap.videoWidth <= 0 || snap.videoHeight <= 0)) {
        triggerAutoRetry("room stream produced no video");
      }
    }, ROOM_STALL_MS);
    return () => window.clearTimeout(t);
  }, [inRoom, isLocal, isLive, snap.status, snap.videoWidth, snap.videoHeight, triggerAutoRetry, src.url, selfFrameReadyRef]);

  return { slowLoad, transcodedUrl };
}
