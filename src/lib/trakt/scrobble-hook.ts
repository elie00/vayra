import { useEffect, useRef } from "react";
import { useTrakt } from "./provider";
import { TRAKT_API_BASE, TRAKT_API_VERSION, TRAKT_CLIENT_ID } from "./config";
import { getSession } from "./session";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import { useSettings } from "@/lib/settings";
import type { PlayerSrc } from "@/lib/view";

type Snap = {
  status: string;
  positionSec: number;
  durationSec: number;
};

type LastAction = "start" | "pause" | "stop" | null;

export function useTraktScrobble({ src, snap }: { src: PlayerSrc; snap: Snap }): void {
  const { isConnected, resolveTarget, scrobble } = useTrakt();
  const { settings } = useSettings();
  const pauseOnPauseRef = useRef(settings.pauseListStatusOnPause);
  pauseOnPauseRef.current = settings.pauseListStatusOnPause;
  const lastActionRef = useRef<LastAction>(null);
  const lastKeyRef = useRef<string | null>(null);
  const prevIdentityRef = useRef({ metaId: src.meta.id, episode: src.episode });

  const metaId = src.meta.id;
  const season = src.episode?.season;
  const episode = src.episode?.episode;
  const key = `${metaId}|${season ?? ""}|${episode ?? ""}`;

  const stopArgsRef = useRef({ metaId, episode: src.episode, snap });
  stopArgsRef.current = { metaId, episode: src.episode, snap };

  useEffect(() => {
    if (!isConnected) return;
    const target = resolveTarget(metaId, src.episode);
    if (!target) return;
    const onPageHide = () => {
      const a = stopArgsRef.current;
      if (a.snap.durationSec <= 0) return;
      if (lastActionRef.current !== "start" && lastActionRef.current !== "pause") return;
      const progress = Math.min(100, Math.max(0, (getPlaybackPosition() / a.snap.durationSec) * 100));
      if (progress < 80 && !pauseOnPauseRef.current) return;
      const action = progress >= 80 ? "stop" : "pause";
      sendBeacon(target, progress, action);
      lastActionRef.current = action;
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [isConnected, resolveTarget, metaId, src.episode]);

  useEffect(() => {
    if (lastKeyRef.current && lastKeyRef.current !== key) {
      const prevPos = getPlaybackPosition();
      const prevDur = snap.durationSec;
      if (prevDur > 0 && pauseOnPauseRef.current) {
        const progress = Math.min(100, (prevPos / prevDur) * 100);
        const prev = prevIdentityRef.current;
        scrobble("pause", { metaId: prev.metaId, episode: prev.episode, progress });
      }
      lastActionRef.current = "pause";
    }
    lastKeyRef.current = key;
    prevIdentityRef.current = { metaId, episode: src.episode };
  }, [key, metaId, src.episode, scrobble, snap.durationSec]);

  useEffect(() => {
    if (!isConnected) return;
    const target = resolveTarget(metaId, src.episode);
    if (!target) return;
    if (snap.durationSec <= 0) return;
    const progress = Math.min(100, Math.max(0, (getPlaybackPosition() / snap.durationSec) * 100));

    if (snap.status === "ended") {
      if (lastActionRef.current === "start" || lastActionRef.current === "pause") {
        scrobble("stop", { metaId, episode: src.episode, progress: 100 });
        lastActionRef.current = "stop";
      }
      return;
    }
    if (lastActionRef.current === "stop") return;

    if (snap.status === "playing" && lastActionRef.current !== "start") {
      scrobble("start", { metaId, episode: src.episode, progress });
      lastActionRef.current = "start";
    } else if (snap.status === "paused" && lastActionRef.current === "start") {
      if (pauseOnPauseRef.current) {
        scrobble("pause", { metaId, episode: src.episode, progress });
      }
      lastActionRef.current = "pause";
    }
  }, [
    isConnected,
    resolveTarget,
    scrobble,
    metaId,
    src.episode,
    snap.status,
    snap.durationSec,
  ]);

  const seekTrackRef = useRef({ pos: 0, at: 0, lastResyncAt: 0 });
  useEffect(() => {
    if (!isConnected) return;
    if (snap.durationSec <= 0) return;
    if (lastActionRef.current !== "start") {
      seekTrackRef.current = { pos: getPlaybackPosition(), at: Date.now(), lastResyncAt: 0 };
      return;
    }
    const id = window.setInterval(() => {
      if (lastActionRef.current !== "start") return;
      const now = Date.now();
      const ref = seekTrackRef.current;
      const pos = getPlaybackPosition();
      const dPos = pos - ref.pos;
      const dT = (now - ref.at) / 1000;
      ref.pos = pos;
      ref.at = now;
      const isSeek = Math.abs(dPos) > 8 && (dT < 1.5 || Math.abs(dPos / Math.max(0.001, dT)) > 4);
      if (!isSeek) return;
      if (now - ref.lastResyncAt < 30000) return;
      ref.lastResyncAt = now;
      const progress = Math.min(100, Math.max(0, (pos / snap.durationSec) * 100));
      scrobble("start", { metaId, episode: src.episode, progress });
    }, 1000);
    return () => window.clearInterval(id);
  }, [isConnected, scrobble, metaId, src.episode, snap.status, snap.durationSec]);

  useEffect(() => {
    return () => {
      if (lastActionRef.current !== "start" && lastActionRef.current !== "pause") return;
      const a = stopArgsRef.current;
      if (a.snap.durationSec > 0) {
        const progress = Math.min(100, (getPlaybackPosition() / a.snap.durationSec) * 100);
        const action = progress >= 80 ? "stop" : "pause";
        if (action === "stop" || pauseOnPauseRef.current) {
          scrobble(action, { metaId: a.metaId, episode: a.episode, progress });
        }
        lastActionRef.current = action;
      } else {
        lastActionRef.current = "pause";
      }
    };
  }, [scrobble]);
}

function sendBeacon(
  target: ReturnType<NonNullable<ReturnType<typeof useTrakt>["resolveTarget"]>> & object,
  progress: number,
  action: "stop" | "pause",
): void {
  const session = getSession();
  if (!session) return;
  const clamped = Math.max(0, Math.min(100, Number(progress.toFixed(2))));
  let body: object;
  if (target.kind === "movie") {
    body = { movie: { ids: target.ids }, progress: clamped };
  } else if (target.kind === "episode") {
    body = {
      show: { ids: target.show.ids },
      episode: { season: target.season, number: target.number },
      progress: clamped,
    };
  } else {
    body = { show: { ids: target.ids }, progress: clamped };
  }
  const url = `${TRAKT_API_BASE}/scrobble/${action}`;
  try {
    void fetch(url, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
        "trakt-api-version": TRAKT_API_VERSION,
        "trakt-api-key": TRAKT_CLIENT_ID,
      },
      body: JSON.stringify(body),
    });
  } catch {
    /* noop */
  }
}
