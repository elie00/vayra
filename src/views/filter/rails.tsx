import { useMemo } from "react";
import { useSettings } from "@/lib/settings";
import type { MetaFilter } from "@/lib/view";
import type { LanguageMediaScope } from "./header";
import { CinemetaFallback } from "./cinemeta-fallback";
import { RailSection } from "./rail-section";
import { railsForFilter } from "./rails-config";
import { SpotlightSection } from "./spotlight-section";
import { TopicSection } from "./topic-section";

export function Rails({
  filter,
  languageScope = "all",
}: {
  filter: MetaFilter;
  languageScope?: LanguageMediaScope;
}) {
  const { settings } = useSettings();
  const rails = useMemo(() => {
    const all = railsForFilter(filter);
    if (filter.kind !== "language" || languageScope === "all") return all;
    return all.filter((r) => r.kind === "standard" && r.mediaType === languageScope);
  }, [filter, languageScope]);
  if (!settings.tmdbKey) {
    return <CinemetaFallback filter={filter} />;
  }
  return (
    <>
      {rails.map((r) => {
        if (r.kind === "spotlight") {
          return <SpotlightSection key={r.id} spotlight={r.spotlight} genreId={r.genreId} />;
        }
        if (r.kind === "topic") {
          return <TopicSection key={r.id} topic={r.topic} mediaType={r.mediaType} />;
        }
        return <RailSection key={r.id} filter={filter} rail={r} />;
      })}
    </>
  );
}
