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
};

export type PortStatusLine = { tone: "ok" | "pending" | "bad"; text: string };

/** An incoming peer proves the port open; until one comes, the router's answer is all there is. */
export function portStatusLine(s: PortStatus): PortStatusLine {
  if (s.port == null) return { tone: "pending", text: t("The torrent engine is not listening yet") };
  const port = s.port;
  if (s.incoming > 0) {
    const text = s.incoming_ipv6 > 0
      ? t("Port {port} open: {count} peers connected to VAYRA, {ipv6} over IPv6", { port, count: s.incoming, ipv6: s.incoming_ipv6 })
      : t("Port {port} open: {count} peers connected to VAYRA", { port, count: s.incoming });
    return { tone: "ok", text };
  }
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
