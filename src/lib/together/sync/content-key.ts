// Coarse, non-identifying content fingerprint for the VEYA same-media guard.
//
// Derived from the local media key (`metaId|season|episode`) via a fast hash so
// the sync wire carries only an opaque token that answers "same content or not?"
// — no raw catalogue id, title, URL or source ever crosses the channel. It is
// NOT a security boundary (a peer sharing the room could brute-force the small
// id space); it exists solely to stop the authority's playback intent from being
// applied to a peer that has navigated to a different title/episode.
export function contentKeyOf(mediaKey: string): string {
  // FNV-1a 32-bit → 8 hex chars. Deterministic across peers for equality checks.
  let h = 0x811c9dc5;
  for (let i = 0; i < mediaKey.length; i += 1) {
    h ^= mediaKey.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
