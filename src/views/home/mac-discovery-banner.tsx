import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import type { Meta } from "@/lib/cinemeta";

export function MacDiscoveryBanner({ meta }: { meta?: Meta }) {
  const t = useT();
  const { openMeta, setView } = useView();
  if (!meta) return null;
  return <section aria-label={t("Discoveries")} className="grid min-h-56 grid-cols-[1fr_40%] overflow-hidden rounded-2xl bg-elevated">
    <div className="flex flex-col items-start justify-center gap-3 p-7">
      <p className="text-[12px] font-medium text-ink-muted">{t("Discoveries")}</p>
      <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">{meta.name}</h2>
      <div className="mt-2 flex flex-wrap gap-2"><button type="button" className="mac-primary-button" onClick={() => openMeta(meta)}>{t("View details")}</button><button type="button" className="mac-secondary-button" onClick={() => setView("discover")}>{t("Explore")}</button></div>
    </div>
    {(meta.background || meta.poster) && <img src={meta.background || meta.poster} alt="" loading="lazy" className="h-64 w-full object-cover" />}
  </section>;
}
