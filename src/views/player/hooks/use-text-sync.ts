import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { PlayerBridge } from "@/lib/player/bridge";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import { fetchAndParse, type SubCue } from "@/lib/subtitles/parser";
import { toSrt, toVtt } from "@/lib/subtitles/serialize";
import { computeSyncMap, applySync, type SyncAnchor } from "@/lib/subtitles/text-sync";
import { writePlayerPrefs } from "@/lib/player-prefs";

type Phase = "listen" | "review";

interface TextSyncState {
  syncMode: "idle" | "active";
  mode: "easy" | "normal";
  phase: Phase;
  anchors: SyncAnchor[];
  activeAnchorSlot: 0 | 1;
  pendingCues: SubCue[] | null;
  previewOffset: number;
  baseOffset: number;
  dirty: boolean;
  sourceFormat: "srt" | "vtt";
}

const INITIAL_STATE: TextSyncState = {
  syncMode: "idle",
  mode: "easy",
  phase: "listen",
  anchors: [],
  activeAnchorSlot: 0,
  pendingCues: null,
  previewOffset: 0,
  baseOffset: 0,
  dirty: false,
  sourceFormat: "srt",
};

export type EnterSyncResult = { ok: true } | { ok: false; reason: string };
export type SaveResult = { ok: true } | { ok: false; reason: string };

export function useTextSync(bridge: PlayerBridge | null, metaId: string) {
  const [state, setState] = useState<TextSyncState>(INITIAL_STATE);

  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;
  const metaIdRef = useRef(metaId);
  metaIdRef.current = metaId;
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (state.syncMode !== "active") return;
    bridgeRef.current?.setSubDelay(state.previewOffset);
  }, [state.syncMode, state.previewOffset]);

  const enterSync = useCallback(async (): Promise<EnterSyncResult> => {
    const b = bridgeRef.current;
    if (!b) return { ok: false, reason: "no-bridge" };

    let cues: SubCue[] | null = b.getSelectedTrackCues();
    let sourceFormat: "srt" | "vtt" = "srt";
    const rawUrl = b.getSelectedTrackUrl();

    if ((!cues || cues.length === 0) && rawUrl) {
      const readableUrl = await resolveReadableUrl(rawUrl);
      if (!readableUrl) {
        return { ok: false, reason: "local-path-unreadable" };
      }
      try {
        cues = await fetchAndParse(readableUrl);
      } catch (e) {
        return {
          ok: false,
          reason: `fetch-failed: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }

    if (!cues || cues.length === 0) {
      return { ok: false, reason: "no-cues" };
    }

    if (rawUrl) sourceFormat = detectFormatFromUrl(rawUrl);

    let baseOffset = 0;
    const unsub = b.subscribe((snap) => {
      baseOffset = snap.subDelaySec;
    });
    unsub();

    setState({
      syncMode: "active",
      mode: "easy",
      phase: "listen",
      anchors: [],
      activeAnchorSlot: 0,
      pendingCues: cues,
      previewOffset: baseOffset,
      baseOffset,
      dirty: false,
      sourceFormat,
    });
    return { ok: true };
  }, []);

  const pickCue = useCallback((cueIndex: number) => {
    setState((prev) => {
      if (prev.syncMode !== "active" || !prev.pendingCues) return prev;
      const cue = prev.pendingCues[cueIndex];
      if (!cue) return prev;

      const heardAt = getPlaybackPosition();
      const cueStart = cue.start;
      const delta = heardAt - cueStart;
      const newAnchor: SyncAnchor = { t: cueStart, heardAt, delta, cueIndex };

      let newAnchors: SyncAnchor[];
      let newSlot: 0 | 1;

      if (prev.anchors.length < 2) {
        newAnchors = [...prev.anchors, newAnchor];
        newSlot = newAnchors.length === 2 ? prev.activeAnchorSlot : (newAnchors.length as 0 | 1);
      } else {
        newAnchors = prev.anchors.slice();
        newAnchors[prev.activeAnchorSlot] = newAnchor;
        newSlot = prev.activeAnchorSlot;
      }

      const newPhase: Phase = newAnchors.length === 2 ? "review" : "listen";
      return {
        ...prev,
        anchors: newAnchors,
        activeAnchorSlot: newSlot,
        phase: newPhase,
        dirty: true,
      };
    });
  }, []);

  const selectSlot = useCallback((slot: 0 | 1) => {
    setState((prev) => ({ ...prev, activeAnchorSlot: slot }));
  }, []);

  const setMode = useCallback((mode: "easy" | "normal") => {
    setState((prev) => ({ ...prev, mode }));
  }, []);

  const seekTo = useCallback((cueIndex: number) => {
    const cue = stateRef.current.pendingCues?.[cueIndex];
    if (!cue) return;
    bridgeRef.current?.seek(cue.start);
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.anchors.length === 0) return prev;
      const newAnchors = prev.anchors.slice(0, -1);
      const newSlot = newAnchors.length as 0 | 1;
      const newPhase: Phase = newAnchors.length === 2 ? "review" : "listen";
      return {
        ...prev,
        anchors: newAnchors,
        activeAnchorSlot: newSlot,
        phase: newPhase,
      };
    });
  }, []);

  const nudgeOffset = useCallback((deltaSec: number) => {
    setState((prev) => ({
      ...prev,
      previewOffset: Math.round((prev.previewOffset + deltaSec) * 1000) / 1000,
    }));
  }, []);

  const exitSync = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const save = useCallback(async (confirmSingleAnchor?: boolean): Promise<SaveResult> => {
    const b = bridgeRef.current;
    const mid = metaIdRef.current;
    const cur = stateRef.current;

    if (cur.syncMode !== "active" || !cur.pendingCues) {
      return { ok: false, reason: "not-active" };
    }
    if (cur.anchors.length === 0 && cur.mode !== "easy") {
      return { ok: false, reason: "no-anchors" };
    }
    if (cur.anchors.length === 1 && confirmSingleAnchor !== true) {
      return { ok: false, reason: "needs-confirmation" };
    }

    try {
      const syncMap = computeSyncMap(cur.anchors);
      const finalCues = applySync(cur.pendingCues, syncMap, cur.previewOffset);
      const text = cur.sourceFormat === "vtt" ? toVtt(finalCues) : toSrt(finalCues);
      const ext = cur.sourceFormat === "vtt" ? "vtt" : "srt";

      const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      let applied = false;

      if (isTauri) {
        try {
          const pathMod = await import("@tauri-apps/api/path");
          const tmpDir = await pathMod.tempDir();
          const harborSubsDir = await pathMod.join(tmpDir, "harbor-subs");
          const fileName = `synced-${Date.now()}.${ext}`;
          const filePath = await pathMod.join(harborSubsDir, fileName);
          await invoke("save_text_file", { path: filePath, contents: text });
          const ok = await b?.addSubtitle(filePath, undefined, `Synced (${ext.toUpperCase()})`, true);
          applied = ok === true;
        } catch (e) {
          console.warn("[text-sync] silent apply failed, falling back to download", e);
        }
      }

      if (!applied) {
        const { downloadText } = await import("@/lib/download-text");
        const saved = await downloadText(`subtitle.synced.${ext}`, text, [ext], "Subtitle");
        if (!saved) {
          return { ok: false, reason: "save-cancelled" };
        }
      }

      b?.setSubDelay(0);
      if (mid) writePlayerPrefs(mid, { subDelaySec: 0 });
      exitSync();
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        reason: `save-failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }, [exitSync]);

  const discard = useCallback(() => {
    const b = bridgeRef.current;
    const mid = metaIdRef.current;
    const baseOffset = stateRef.current.baseOffset;
    b?.setSubDelay(baseOffset);
    if (mid) writePlayerPrefs(mid, { subDelaySec: baseOffset });
    exitSync();
  }, [exitSync]);

  return {
    ...state,
    enterSync,
    pickCue,
    selectSlot,
    setMode,
    seekTo,
    undo,
    nudgeOffset,
    save,
    discard,
    exitSync,
  };
}

async function resolveReadableUrl(url: string): Promise<string | null> {
  if (/^(https?|blob|data|tauri|asset):/i.test(url)) return url;
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      return convertFileSrc(url);
    } catch {
      return null;
    }
  }
  return null;
}

function detectFormatFromUrl(url: string): "srt" | "vtt" {
  const ext = url.split(/[?#]/)[0].match(/\.([a-z]{2,4})$/i)?.[1]?.toLowerCase();
  if (ext === "vtt") return "vtt";
  return "srt";
}
