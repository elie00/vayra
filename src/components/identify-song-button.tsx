import { useState } from "react";
import { AudioLines } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { identifyNowPlaying } from "@/lib/song-id";
import { Tooltip } from "@/components/player/transport/tooltip";

/** Player control button that triggers AudD song identification.
 *  Reads the AudD key from Settings → Library & metadata.
 *  Uses the shared Tooltip so the hint shows instantly, matching the
 *  other transport controls (no slow native title tooltip). */
export function IdentifySongButton({
  className,
  tight,
}: {
  className?: string;
  tight?: boolean;
}) {
  const { settings } = useSettings();
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    if (pending) return;
    setPending(true);
    try {
      await identifyNowPlaying(settings.auddKey ?? "");
    } finally {
      setPending(false);
    }
  };

  return (
    <Tooltip label="Identify song">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-label="Identify song"
        className={
          className ??
          "pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15 disabled:opacity-50"
        }
      >
        <AudioLines
          size={tight ? 18 : 22}
          strokeWidth={1.9}
          className={pending ? "animate-pulse" : undefined}
        />
      </button>
    </Tooltip>
  );
}