import { useEffect, useRef, useState } from "react";
import { diagnoseAddon, type AddonDiagnostic } from "@/lib/addon-diagnostic";
import { useT } from "@/lib/i18n";

export function AddonDiagnosticButton({ url }: { url: string }) {
  const t = useT();
  const [result, setResult] = useState<AddonDiagnostic | "testing" | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), [url]);
  const test = async () => {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setResult("testing");
    const next = await diagnoseAddon(url, controller.signal);
    if (!controller.signal.aborted) setResult(next);
  };
  return <div className="mt-2 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    <button type="button" disabled={result === "testing"} className="mac-secondary-button" onClick={() => void test()}>{result === "testing" ? t("Testing extension…") : t("Test extension")}</button>
    {result && result !== "testing" && <span role="status" className="text-[12px] text-ink-muted">{t(result === "reachable" ? "Manifest reachable" : result === "configuration" ? "Configuration required" : result === "access" ? "Access denied: check your connection settings" : result === "invalid" ? "Invalid extension manifest" : "Extension unavailable or timed out")}</span>}
    {result === "reachable" && <span className="basis-full text-[11px] text-ink-subtle">{t("The manifest responds. Video playback and subscription validity are not tested.")}</span>}
  </div>;
}
