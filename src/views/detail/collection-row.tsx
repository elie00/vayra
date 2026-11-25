import { ArrowUpRight, Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { PickCard } from "@/components/pick-card";
import { Row } from "@/components/row";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { cleanCollectionTitle, tmdbCollection } from "@/lib/providers/tmdb";
import { useActiveKid } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { dropUnreleased } from "@/views/kids/kids-filter";

export function CollectionRow({
  collection,
  currentId,
}: {
  collection: { id: number; name: string };
  currentId: string;
}) {
  const t = useT();
  const { settings } = useSettings();
  const { openCollection } = useView();
  const kid = useActiveKid();
  const [parts, setParts] = useState<Meta[]>([]);
  const [totalParts, setTotalParts] = useState(0);
  const [displayName, setDisplayName] = useState(() => cleanCollectionTitle(collection.name));

  useEffect(() => {
    if (!settings.tmdbKey) return;
    let cancelled = false;
    setParts([]);
    setTotalParts(0);
    setDisplayName(cleanCollectionTitle(collection.name));
    tmdbCollection(settings.tmdbKey, collection.id)
      .then((c) => {
        if (cancelled || !c) return;
        const rest = c.parts.filter((p) => p.id !== currentId);
        setParts(kid ? dropUnreleased(rest) : rest);
        setTotalParts(c.parts.length);
        if (c.displayName) setDisplayName(c.displayName);
      })
      .catch(() => {
        /* best-effort related saga strip; hidden when collection fetch fails */
      });
    return () => {
      cancelled = true;
    };
  }, [settings.tmdbKey, collection.id, collection.name, currentId, kid]);

  if (parts.length === 0) return null;

  return (
    <Row
      scrollKey={`collection-${collection.id}`}
      title={displayName}
      titleExtra={
        totalParts > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-edge-soft/70 bg-surface/85 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-subtle">
            <Layers size={10.5} />
            {totalParts === 1
              ? t("{n} film", { n: totalParts })
              : t("{count} films", { count: totalParts })}
          </span>
        ) : undefined
      }
      headerRight={
        <button
          type="button"
          onClick={() => openCollection(collection.id)}
          className="mac-secondary-button"
        >
          <span>{t("Explore saga")}</span>
          <ArrowUpRight size={13} strokeWidth={2} className="text-ink-subtle" />
        </button>
      }
    >
      {parts.map((m) => (
        <PickCard key={m.id} meta={m} kids={!!kid} />
      ))}
    </Row>
  );
}
