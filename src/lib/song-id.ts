import { invoke } from "@tauri-apps/api/core";

export type SongResult = {
  title: string;
  artist: string;
  album: string;
  artwork: string; // may be "" when no cover art is available
  link: string;
  /** Total length of the identified track, in seconds (0 when unknown). */
  durationSec: number;
  /** Offset inside the track at the moment of identification, in seconds
   *  (AudD "timecode"; 0 when unknown). */
  startSec: number;
} | null;

export type SongIdToastMsg = {
  kind: "info" | "result" | "error";
  title: string;
  body?: string;
  art?: string;
  /** External link to open on click (YouTube search for the track). */
  href?: string;
  /** Song length in seconds (for the progress bar / time display). */
  durationSec?: number;
  /** Song offset at identification, in seconds. */
  startSec?: number;
};

const TOAST_EVENT = "harbor:song-id-toast";

function toast(msg: SongIdToastMsg): void {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: msg }));
}

/** Subscribe to in-player toast messages. Returns an unsubscribe fn. */
export function onSongIdToast(cb: (msg: SongIdToastMsg) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<SongIdToastMsg>).detail);
  window.addEventListener(TOAST_EVENT, h);
  return () => window.removeEventListener(TOAST_EVENT, h);
}

function youtubeSearchUrl(artist: string, title: string): string {
  const q = [artist, title].filter(Boolean).join(" ").trim();
  return "https://www.youtube.com/results?search_query=" + encodeURIComponent(q);
}

let busy = false;

export function isIdentifying(): boolean {
  return busy;
}

/** Capture ~7s of system audio and identify the song via AudD.
 *  Feedback is shown as an in-player toast (no OS notification). */
export async function identifyNowPlaying(apiToken: string): Promise<void> {
  if (busy) return;
  const token = (apiToken ?? "").trim();
  if (!token) {
    toast({
      kind: "error",
      title: "Missing AudD key",
      body: "Add it in Settings → Library & metadata",
    });
    return;
  }
  busy = true;
  toast({ kind: "info", title: "Listening…" });
  try {
    const res = await invoke<SongResult>("recognize_now_playing", {
      apiToken: token,
      seconds: 7,
    });
    if (!res) {
      toast({ kind: "error", title: "Couldn't identify the song" });
      return;
    }
    toast({
      kind: "result",
      title: res.title,
      body: `${res.artist}${res.album ? " · " + res.album : ""}`,
      art: res.artwork || undefined,
      href: youtubeSearchUrl(res.artist, res.title),
      durationSec: res.durationSec || undefined,
      startSec: res.startSec || undefined,
    });
  } catch (e) {
    console.error("song-id failed", e);
    toast({ kind: "error", title: "Song identification failed" });
  } finally {
    busy = false;
  }
}