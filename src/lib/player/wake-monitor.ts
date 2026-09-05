/** Detect suspended JS timers after macOS sleep, plus network reconnection.
 * This does not change playback intent, window size, or fullscreen state. */
export function watchPlaybackWake(check: () => void): () => void {
  if (typeof window === "undefined" || !window.addEventListener) return () => {};
  let last = Date.now();
  const tick = () => {
    const now = Date.now();
    if (now - last > 30_000) check();
    last = now;
  };
  const online = () => { last = Date.now(); check(); };
  const timer = setInterval(tick, 5_000);
  window.addEventListener("online", online);
  window.addEventListener("focus", tick);
  return () => { clearInterval(timer); window.removeEventListener("online", online); window.removeEventListener("focus", tick); };
}

export async function localResumeWithin(resolve?: () => Promise<string | null>): Promise<string | null> {
  if (!resolve) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([resolve(), new Promise<null>((done) => { timer = setTimeout(() => done(null), 1500); })]);
  } catch { return null; }
  finally { clearTimeout(timer); }
}
