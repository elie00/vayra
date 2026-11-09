import { useEffect } from "react";
import { isBundledEngineUrl, isLocalEngineUrl } from "@/lib/stremio-server";
import { setTrickplayState, trickplaySetUrl, trickplaySpawnEager, trickplayStop } from "@/lib/trickplay";

export function useTrickplay({ url, enabled, isLive }: { url: string; enabled: boolean; isLive?: boolean }) {
  useEffect(() => {
    if (!enabled || !url) {
      setTrickplayState({ active: false, bufferedOnly: false });
      return;
    }
    // VAYRA's own engine as well as the bundled Stremio server: previews of parts
    // not downloaded yet would have the engine fetch them before the playing ones.
    const isTorrent = isBundledEngineUrl(url) || isLocalEngineUrl(url);
    setTrickplayState({ active: true, bufferedOnly: isTorrent });
    let alive = true;
    void trickplaySetUrl(url).then(() => {
      if (!alive) return;
      if (!isLive) void trickplaySpawnEager();
    });
    return () => {
      alive = false;
      setTrickplayState({ active: false, bufferedOnly: false });
      void trickplayStop();
    };
  }, [url, enabled, isLive]);
}
