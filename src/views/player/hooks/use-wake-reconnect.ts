import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { DebridStore } from "@/lib/debrid/types";
import type { PlayerBridge, PlayerSnapshot } from "@/lib/player/bridge";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import { isLocalUrl } from "@/lib/player/local-url";
import { hasNativeStreamProxy, registerStreamProxy } from "@/lib/stream-proxy";
import { resolveViaDebrids } from "@/lib/streams/resolve";
import type { PlayerSrc } from "@/lib/view";

const WAKE_GAP_MS = 30_000;
const DEBRID_REFRESH_GAP_MS = 5 * 60_000;
const TICK_MS = 2_000;

export function useWakeReconnect(params: {
  bridgeRef: RefObject<PlayerBridge | null>;
  src: PlayerSrc;
  snap: PlayerSnapshot;
  debrids?: DebridStore[];
}) {
  const { bridgeRef, src, snap, debrids = [] } = params;
  const srcRef = useRef(src);
  srcRef.current = src;
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const debridsRef = useRef(debrids);
  debridsRef.current = debrids;
  const pendingSleepGapRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reconnect = useCallback(
    (gapMs: number) => {
      const s = srcRef.current;
      if (isLocalUrl(s.url)) return;
      const b = bridgeRef.current;
      if (!b) return;
      const pos = getPlaybackPosition();
      const isLive = s.meta.id.startsWith("iptv:");
      const loadUrl = (url: string, headers?: Record<string, string>, notWebReady?: boolean) => {
        const cur = bridgeRef.current;
        if (!cur) return;
        void cur.load({
          url,
          subtitles: s.subtitles,
          notWebReady: notWebReady ?? s.notWebReady,
          isLive,
          headers: headers ?? s.headers,
          startAtSec: pos > 1 ? pos : undefined,
        });
      };

      const infoHash = s.streamRef?.infoHash;
      const activeDebrids = debridsRef.current;
      if (gapMs >= DEBRID_REFRESH_GAP_MS && infoHash && activeDebrids.length > 0 && !isLive) {
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        const cached = Object.fromEntries((s.streamRef?.cachedSlugs ?? []).map((slug) => [slug, true]));
        const hint = s.episode
          ? { season: s.episode.season ?? null, episode: s.episode.episode ?? null }
          : undefined;
        console.warn(`[player] system resumed after ${Math.round(gapMs / 1000)}s asleep — refreshing debrid link`);
        void resolveViaDebrids(infoHash, s.streamRef?.fileIdx ?? undefined, cached, activeDebrids, ac.signal, false, {}, hint)
          .then(async (r) => {
            if (ac.signal.aborted) return;
            if (r.ok) {
              let freshUrl = r.data.url;
              if (hasNativeStreamProxy() && r.data.headers && Object.keys(r.data.headers).length > 0) {
                try {
                  freshUrl = (await registerStreamProxy(r.data.url, r.data.headers)).url;
                } catch {
                  /* fallback to raw debrid URL */
                }
              }
              loadUrl(freshUrl, r.data.headers, r.data.notWebReady);
            } else {
              loadUrl(s.url);
            }
          })
          .catch(() => {
            if (!ac.signal.aborted) loadUrl(s.url);
          });
        return;
      }

      console.warn(`[player] system resumed after ${Math.round(gapMs / 1000)}s asleep — reconnecting stream`);
      loadUrl(s.url);
    },
    [bridgeRef],
  );

  useEffect(() => {
    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const gap = now - last;
      last = now;
      if (gap < WAKE_GAP_MS) return;

      const s = srcRef.current;
      if (isLocalUrl(s.url)) return;
      const curSnap = snapRef.current;
      if (curSnap.status === "ended" || curSnap.status === "idle") return;
      if (curSnap.durationSec <= 0 && getPlaybackPosition() <= 0) return;

      // A paused video stays paused after sleep, but if the lid stayed closed
      // long enough for a signed Debrid URL to expire, refresh as soon as the
      // user hits Play again.
      if (curSnap.status === "paused") {
        pendingSleepGapRef.current = Math.max(pendingSleepGapRef.current ?? 0, gap);
        return;
      }

      pendingSleepGapRef.current = null;
      reconnect(gap);
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [reconnect]);

  useEffect(() => {
    const gap = pendingSleepGapRef.current;
    if (gap == null) return;
    if (snap.status !== "playing" && snap.status !== "loading") return;
    pendingSleepGapRef.current = null;
    if (gap >= DEBRID_REFRESH_GAP_MS) {
      reconnect(gap);
    }
  }, [snap.status, reconnect]);
}
