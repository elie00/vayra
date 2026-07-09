import { Home } from "lucide-react";
import { PickCard } from "@/components/pick-card";
import { Row } from "@/components/row";
import { useT } from "@/lib/i18n";
import { togglePinnedCatalog, useIsPinned } from "@/lib/pinned-catalogs";
import { useAnilistAnimeRails, type AnilistRail } from "@/lib/use-anilist-anime-rails";

export function AnilistRows() {
  const t = useT();
  const rails = useAnilistAnimeRails();
  if (rails.length === 0) return null;
  return (
    <>
      {rails.map((rail) => {
        const label =
          rail.key === "recommended"
            ? t("Recommended for you")
            : t("Your AniList: {name}", { name: rail.title });
        return (
          <div key={rail.key} data-scroll-anchor={`row:anilist:${rail.key}`}>
            <Row
              title={
                <span className="inline-flex items-center gap-2">
                  {label}
                  <PinHomeButton rail={rail} label={label} />
                </span>
              }
              scrollKey={`anime:anilist:${rail.key}`}
            >
              {rail.metas.map((m, i) => (
                <PickCard key={`${m.id}-${i}`} meta={m} />
              ))}
            </Row>
          </div>
        );
      })}
    </>
  );
}

function PinHomeButton({ rail, label }: { rail: AnilistRail; label: string }) {
  const t = useT();
  const id = `anilist:${rail.key}`;
  const pinned = useIsPinned(id);
  return (
    <button
      type="button"
      onClick={() =>
        togglePinnedCatalog({ id, source: "anilist", name: label, params: { railKey: rail.key } })
      }
      aria-pressed={pinned}
      aria-label={pinned ? t("Remove from Home") : t("Add to Home Screen")}
      title={pinned ? t("Remove from Home") : t("Add to Home Screen")}
      className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
        pinned
          ? "border-accent/50 bg-accent/15 text-accent"
          : "border-edge-soft bg-canvas/40 text-ink-subtle hover:border-edge hover:text-ink-muted"
      }`}
    >
      <Home size={14} strokeWidth={2.2} />
    </button>
  );
}
