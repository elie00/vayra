import { useEffect, useMemo, useState } from "react";
import { Poster } from "@/components/poster";
import { rpdbPoster } from "@/lib/providers/rpdb";
import { useSettings } from "@/lib/settings";

export function ResultPoster({
  id,
  poster,
  className,
}: {
  id: string;
  poster?: string;
  className?: string;
}) {
  const { settings } = useSettings();
  const [idx, setIdx] = useState(0);
  const candidates = useMemo(() => {
    const out: string[] = [];
    for (const u of [rpdbPoster(settings.rpdbKey, id, poster), poster]) {
      if (u && !out.includes(u)) out.push(u);
    }
    return out;
  }, [settings.rpdbKey, id, poster]);
  useEffect(() => setIdx(0), [candidates]);
  return (
    <Poster
      src={candidates[idx]}
      seed={id}
      ratio="portrait"
      className={className}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
