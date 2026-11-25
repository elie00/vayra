import { ArrowUpRight } from "lucide-react";
import { CollectionCard } from "@/components/collection-card";
import { COLLECTIONS_CATALOG } from "@/lib/collections-catalog";
import { useT } from "@/lib/i18n";
import { hasNativeDesktopUx, isMobileTauri } from "@/lib/platform";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { Row } from "./row";

export function CollectionsRow() {
  const { settings } = useSettings();
  const { openCollections } = useView();
  const t = useT();
  if (!settings.tmdbKey) return null;
  const desktop = hasNativeDesktopUx();
  return (
    <Row
      title={t("Collections")}
      titleExtra={
        desktop ? (
          <span className="rounded-full border border-edge-soft/70 bg-surface/85 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-subtle">
            {COLLECTIONS_CATALOG.length}
          </span>
        ) : undefined
      }
      min={isMobileTauri() ? 270 : 350}
      shape="banner"
      arrowsAlways
      scrollKey="home:collections"
      onViewAll={desktop ? undefined : openCollections}
      headerRight={
        desktop ? (
          <button type="button" className="mac-secondary-button" onClick={openCollections}>
            {t("View all")}
            <ArrowUpRight size={13} strokeWidth={2} className="text-ink-subtle" />
          </button>
        ) : undefined
      }
    >
      {COLLECTIONS_CATALOG.slice(0, 30).map((c) => (
        <CollectionCard key={`${c.id}-${c.name}`} id={c.id} name={c.name} />
      ))}
    </Row>
  );
}
