import { describe, expect, it } from "vitest";
import { portStatusLine, type PortStatus } from "./port-status";

const base: PortStatus = { port: 16881, forwarding: "pending", incoming: 0, incoming_ipv6: 0, last_incoming_ms: null };

describe("portStatusLine", () => {
  it("calls the port open once a peer reached it, whatever the router said", () => {
    expect(portStatusLine({ ...base, forwarding: "failed", incoming: 12 })).toEqual({
      tone: "ok",
      text: "Port 16881 open: 12 peers connected to VAYRA",
    });
    expect(portStatusLine({ ...base, incoming: 3, incoming_ipv6: 1 }).text).toBe(
      "Port 16881 open: 3 peers connected to VAYRA, 1 over IPv6",
    );
  });

  it("explains what the router did while no peer has come in yet", () => {
    expect(portStatusLine({ ...base, forwarding: "forwarded" })).toEqual({
      tone: "pending",
      text: "Port 16881 forwarded by your router; no peer has connected yet",
    });
    expect(portStatusLine({ ...base, forwarding: "failed" }).tone).toBe("bad");
    expect(portStatusLine({ ...base, forwarding: "no-service" }).tone).toBe("bad");
    expect(portStatusLine(base).tone).toBe("pending");
  });

  it("blames the Windows firewall before the router while no peer has come in", () => {
    const forwarded = { ...base, forwarding: "forwarded" as const };
    expect(portStatusLine({ ...forwarded, firewall: "managed" })).toEqual({
      tone: "bad",
      text: "Windows Firewall is managed by your organization and blocks incoming connections: peers cannot reach VAYRA on this network",
    });
    expect(portStatusLine({ ...forwarded, firewall: "no-rule" })).toEqual({
      tone: "bad",
      text: "Windows Firewall does not let VAYRA in yet: allow VAYRA in Windows Security, Firewall & network protection, Allow an app through firewall",
    });
    expect(portStatusLine({ ...forwarded, firewall: "blocked" }).tone).toBe("bad");
    expect(portStatusLine({ ...forwarded, firewall: "blocks-all" }).tone).toBe("bad");
    expect(portStatusLine({ ...forwarded, firewall: "open" }).text).toBe(
      "Port 16881 forwarded by your router; no peer has connected yet",
    );
    expect(portStatusLine({ ...forwarded, firewall: null }).tone).toBe("pending");
  });

  it("trusts an incoming peer over the firewall reading", () => {
    expect(portStatusLine({ ...base, incoming: 2, firewall: "managed" }).tone).toBe("ok");
  });

  it("says when the engine does not listen", () => {
    expect(portStatusLine({ ...base, port: null })).toEqual({
      tone: "pending",
      text: "The torrent engine is not listening yet",
    });
  });
});
