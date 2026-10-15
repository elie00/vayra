import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";

/** What the engine knows about peers reaching its listening port (torrent_engine_port_status). */
export type PortStatus = {
  port: number | null;
  forwarding: "pending" | "forwarded" | "failed" | "no-service";
  incoming: number;
  incoming_ipv6: number;
  last_incoming_ms: number | null;
  /** What Windows Firewall does to incoming peers; null on other systems. */
  firewall?: "open" | "blocks-all" | "blocked" | "managed" | "no-rule" | null;
};

export type PortStatusLine = { tone: "ok" | "pending" | "bad"; text: string };

/** Why Windows Firewall stops peers before they reach the port, or null when it lets them in. */
function firewallLine(s: PortStatus, port: number): PortStatusLine | null {
  switch (s.firewall) {
    case "managed":
      return { tone: "bad", text: t("Windows Firewall is managed by your organization and blocks incoming connections: peers cannot reach VAYRA on this network") };
    case "no-rule":
      return { tone: "bad", text: t("Windows Firewall does not let VAYRA in yet: allow VAYRA in Windows Security, Firewall & network protection, Allow an app through firewall") };
    case "blocked":
      return { tone: "bad", text: t("A Windows Firewall rule blocks VAYRA: peers cannot reach port {port}", { port }) };
    case "blocks-all":
      return { tone: "bad", text: t("Windows Firewall blocks every incoming connection: peers cannot reach VAYRA") };
    default:
      return null;
  }
}

/**
 * An incoming peer proves the port open. Until one comes, the Windows firewall is
 * checked first, since it drops peers even on a forwarded port, then the router.
 */
export function portStatusLine(s: PortStatus): PortStatusLine {
  if (s.port == null) return { tone: "pending", text: t("The torrent engine is not listening yet") };
  const port = s.port;
  if (s.incoming > 0) {
    const text = s.incoming_ipv6 > 0
      ? t("Port {port} open: {count} peers connected to VAYRA, {ipv6} over IPv6", { port, count: s.incoming, ipv6: s.incoming_ipv6 })
      : t("Port {port} open: {count} peers connected to VAYRA", { port, count: s.incoming });
    return { tone: "ok", text };
  }
  const blocked = firewallLine(s, port);
  if (blocked) return blocked;
  switch (s.forwarding) {
    case "forwarded":
      return { tone: "pending", text: t("Port {port} forwarded by your router; no peer has connected yet", { port }) };
    case "failed":
      return { tone: "bad", text: t("Your router refused to forward port {port}: peers cannot reach VAYRA", { port }) };
    case "no-service":
      return { tone: "bad", text: t("Your router offers no automatic forwarding (UPnP, NAT-PMP): open port {port} by hand in its settings", { port }) };
    default:
      return { tone: "pending", text: t("Port {port}: waiting for the router and for peers", { port }) };
  }
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const POLL_MS = 10_000;

/** The port status, refreshed while the caller is mounted; null outside the app or on failure. */
export function usePortStatus(): PortStatus | null {
  const [status, setStatus] = useState<PortStatus | null>(null);
  useEffect(() => {
    if (!isTauri) return;
    let alive = true;
    const load = () =>
      invoke<PortStatus>("torrent_engine_port_status")
        .then((s) => alive && setStatus(s))
        .catch((e) => console.warn("[port-status] unavailable", e));
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  return status;
}
