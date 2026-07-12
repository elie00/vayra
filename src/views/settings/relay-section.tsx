import { TogetherDeployModal } from "@/components/together-deploy-modal";
import { RelayDocs } from "./relay-docs";
import { TogetherRelayPanel } from "./relay-panel";
import { Section } from "./shared";

const IS_WEB = typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

export type RelayMode = "panel" | "docs" | "deploy";

export function RelaySection({
  mode,
  onModeChange,
}: {
  mode: RelayMode;
  onModeChange: (mode: RelayMode) => void;
}) {
  if (mode === "panel") {
    return (
      <div
        key="relay-panel"
        className="animate-in fade-in slide-in-from-left-3 rtl:slide-in-from-right-3 duration-300 ease-[cubic-bezier(0.32,0.72,0.24,1)]"
      >
        <Section
          title="VAYRA Relay"
          subtitle={
            IS_WEB
              ? "VARA rooms are routed through VAYRA's hosted relay."
              : "A Cloudflare Worker on your own account that hosts your VARA rooms."
          }
        >
          <TogetherRelayPanel
            onOpenDocs={() => onModeChange("docs")}
            onOpenDeploy={() => onModeChange("deploy")}
          />
        </Section>
      </div>
    );
  }
  if (mode === "docs") {
    return (
      <div
        key="relay-docs"
        className="animate-in fade-in slide-in-from-right-3 rtl:slide-in-from-left-3 duration-300 ease-[cubic-bezier(0.32,0.72,0.24,1)]"
      >
        <RelayDocs onBack={() => onModeChange("panel")} />
      </div>
    );
  }
  return (
    <div
      key="relay-deploy"
      className="animate-in fade-in slide-in-from-right-3 rtl:slide-in-from-left-3 duration-300 ease-[cubic-bezier(0.32,0.72,0.24,1)]"
    >
      <TogetherDeployModal inline onClose={() => onModeChange("panel")} />
    </div>
  );
}
