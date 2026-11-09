import { Laptop } from "lucide-react";
import { emitAppFeedback } from "@/lib/app-feedback";
import type { Meta } from "@/lib/cinemeta";
import { sendToMac, useLinkStatus } from "@/lib/connect/link";
import { useT } from "@/lib/i18n";

type Episode = { season: number; episode: number };

/**
 * VAYRA Connect on the phone: starts this title on the paired Mac, which picks
 * its own source and resumes from its own progress. Shown while the Mac is connected.
 */
export function PlayOnMacButton({ meta, episode }: { meta: Meta; episode?: Episode }) {
  const t = useT();
  const { mac, connected } = useLinkStatus();
  if (!mac || !connected || (meta.type !== "movie" && meta.type !== "series")) return null;

  const play = () => {
    // The Mac drops the connection over a malformed episode, so only whole numbers go.
    const valid =
      episode && [episode.season, episode.episode].every((n) => Number.isInteger(n) && n >= 0)
        ? { season: episode.season, episode: episode.episode }
        : undefined;
    sendToMac({
      type: "load",
      meta: { id: meta.id, type: meta.type === "series" ? "series" : "movie", name: meta.name, poster: meta.poster ?? undefined },
      episode: meta.type === "series" ? valid : undefined,
    })
      .then(() => emitAppFeedback({ kind: "success", text: t("Starting on {name}…", { name: mac.name }) }))
      .catch(() => emitAppFeedback({ kind: "error", text: t("The Mac isn't connected.") }));
  };

  return (
    <button
      type="button"
      onClick={play}
      aria-label={t("Play on {name}", { name: mac.name })}
      className="flex h-12 items-center gap-2.5 whitespace-nowrap rounded-full border border-edge bg-canvas/80 px-6 text-[15px] font-medium text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[transform,background-color,border-color] duration-200 hover:border-ink-subtle hover:bg-canvas/95 active:scale-[0.98]"
    >
      <Laptop size={18} strokeWidth={2} />
      {t("Play on Mac")}
    </button>
  );
}
