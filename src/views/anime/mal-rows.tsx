import { PickCard } from "@/components/pick-card";
import { Row } from "@/components/row";
import { useT } from "@/lib/i18n";
import { useMalAnimeRails } from "@/lib/use-mal-anime-rails";

export function MalRows() {
  const t = useT();
  const rails = useMalAnimeRails();
  if (rails.length === 0) return null;
  return (
    <>
      {rails.map((rail) => (
        <div key={rail.key} data-scroll-anchor={`row:mal:${rail.key}`}>
          <Row
            title={t("Your MAL: {name}", { name: rail.title })}
            scrollKey={`anime:mal:${rail.key}`}
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
