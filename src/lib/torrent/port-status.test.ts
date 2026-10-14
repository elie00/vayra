import { describe, expect, it } from "vitest";
import { portStatusLine, type PortStatus } from "./port-status";

const base: PortStatus = { port: 16881, upnp: "pending", incoming: 0, incoming_ipv6: 0, last_incoming_ms: null };

describe("portStatusLine", () => {
  it("calls the port open once a peer reached it, whatever the router said", () => {
    expect(portStatusLine({ ...base, upnp: "failed", incoming: 12 })).toEqual({
      tone: "ok",
      text: "Port 16881 open: 12 peers connected to VAYRA",
    });
    expect(portStatusLine({ ...base, incoming: 3, incoming_ipv6: 1 }).text).toBe(
      "Port 16881 open: 3 peers connected to VAYRA, 1 over IPv6",
    );
  });

  it("explains what the router did while no peer has come in yet", () => {
    expect(portStatusLine({ ...base, upnp: "forwarded" })).toEqual({
      tone: "pending",
      text: "Port 16881 forwarded by your router; no peer has connected yet",
    });
    expect(portStatusLine({ ...base, upnp: "failed" }).tone).toBe("bad");
    expect(portStatusLine({ ...base, upnp: "no-service" }).tone).toBe("bad");
    expect(portStatusLine(base).tone).toBe("pending");
  });

  it("says when the engine does not listen", () => {
    expect(portStatusLine({ ...base, port: null })).toEqual({
      tone: "pending",
      text: "The torrent engine is not listening yet",
    });
  });
});
