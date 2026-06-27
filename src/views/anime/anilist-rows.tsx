import { PickCard } from "@/components/pick-card";
import { Row } from "@/components/row";
import { useT } from "@/lib/i18n";
import { useAnilistAnimeRails } from "@/lib/use-anilist-anime-rails";

export function AnilistRows() {
  const t = useT();
  const rails = useAnilistAnimeRails();
  if (rails.length === 0) return null;
  return (
    <>
      {rails.map((rail) => (
        <div key={rail.key} data-scroll-anchor={`row:anilist:${rail.key}`}>
          <Row
            title={
              rail.key === "recommended"
                ? t("Recommended for you")
                : t("Your AniList: {name}", { name: rail.title })
            }
            scrollKey={`anime:anilist:${rail.key}`}
          >
            {rail.metas.map((m, i) => (
              <PickCard key={`${m.id}-${i}`} meta={m} />
            ))}
          </Row>
        </div>
      ))}
    </>
  );
}
